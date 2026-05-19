// Verified: no native Mastra web search/fetch tool as of @mastra/core@1.32.1.
// Custom Global Tools module implementing web_search and web_fetch with TinyFish primary
// and DuckDuckGo/HTTP fallback chain. Always injected into Gateway regardless of active skill.

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { tinyfishSearch, tinyfishFetch, TinyfishUnavailableError } from './tinyfish-client';
import type { SearchResult, FetchResult } from './tinyfish-client';
import { ddgSearch, DDGBotChallengeError } from './ddg-scraper';
import { htmlToMarkdown } from './html-to-markdown';
import { LRUCache } from './lru-cache';

// ─── Cache Instances ────────────────────────────────────────────────────────────

/** Search results cache: 100 entries, 15-minute TTL */
const searchCache = new LRUCache<SearchResult[]>(100, 15 * 60 * 1000);

/** Fetch results cache: 50 entries, 24-hour TTL */
const fetchCache = new LRUCache<FetchResult>(50, 24 * 60 * 60 * 1000);

// ─── Constants ──────────────────────────────────────────────────────────────────

const CHROME_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HTTP_TIMEOUT = 10_000;
const MAX_BODY_SIZE = 750 * 1024; // 750KB

// ─── SSRF Validation ────────────────────────────────────────────────────────────

/**
 * Private/reserved IPv4 ranges that must be blocked for SSRF protection.
 * Each entry: [network as 32-bit int, mask as 32-bit int]
 */
const PRIVATE_RANGES: Array<[number, number]> = [
	[0x7f000000, 0xff000000], // 127.0.0.0/8 (localhost)
	[0x0a000000, 0xff000000], // 10.0.0.0/8
	[0xac100000, 0xfff00000], // 172.16.0.0/12
	[0xc0a80000, 0xffff0000], // 192.168.0.0/16
];

/**
 * Convert an IPv4 address string to a 32-bit unsigned integer.
 * Returns null if the string is not a valid IPv4 address.
 */
function ipv4ToInt(ip: string): number | null {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;

	let result = 0;
	for (const part of parts) {
		const num = parseInt(part, 10);
		if (isNaN(num) || num < 0 || num > 255) return null;
		result = (result << 8) | num;
	}
	return result >>> 0; // Ensure unsigned
}

/**
 * Check if an IP address falls within any private/reserved range.
 */
function isPrivateIP(ip: string): boolean {
	const ipInt = ipv4ToInt(ip);
	if (ipInt === null) return false;

	for (const [network, mask] of PRIVATE_RANGES) {
		if (((ipInt & mask) >>> 0) === network) return true;
	}
	return false;
}

/**
 * Validate a URL for SSRF protection.
 * Rejects non-HTTPS URLs and URLs resolving to private/localhost IPs.
 * Returns an error message if invalid, or null if valid.
 */
export function validateUrlForSSRF(urlString: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(urlString);
	} catch {
		return 'Invalid URL format';
	}

	// Reject non-HTTPS
	if (parsed.protocol !== 'https:') {
		return 'Only HTTPS URLs are allowed';
	}

	const hostname = parsed.hostname;

	// Check if hostname is a raw IP address
	const ipInt = ipv4ToInt(hostname);
	if (ipInt !== null) {
		if (isPrivateIP(hostname)) {
			return `URL resolves to a private/reserved IP address (${hostname})`;
		}
	}

	// Check common localhost hostnames
	if (
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '::1' ||
		hostname === '[::1]'
	) {
		return 'URLs pointing to localhost are not allowed';
	}

	// Check for IPv4-mapped IPv6 addresses like [::ffff:127.0.0.1]
	const cleanHostname = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
	if (cleanHostname.startsWith('::ffff:')) {
		const mappedIp = cleanHostname.slice(7);
		if (isPrivateIP(mappedIp)) {
			return `URL resolves to a private/reserved IP address (${mappedIp})`;
		}
	}

	return null;
}

// ─── Web Search Tool ────────────────────────────────────────────────────────────

export const webSearchTool = createTool({
	id: 'web-search',
	description:
		'Search the web for current information. Returns structured results with title, URL, snippet, and source domain. Use for finding educational resources, documentation, or current information.',
	inputSchema: z.object({
		query: z.string().min(1).max(500),
		count: z.number().int().min(1).max(10).default(5),
		region: z.string().length(2).optional()
	}),
	execute: async ({ query, count, region }) => {
		// Check cache first (TinyFish provider key)
		const tinyfishCacheKey = `tinyfish:${query}:${count}`;
		const cachedTinyfish = searchCache.get(tinyfishCacheKey);
		if (cachedTinyfish) {
			return {
				status: 'SUCCESS' as const,
				provider: 'tinyfish' as const,
				cached: true,
				results: cachedTinyfish,
				resultCount: cachedTinyfish.length
			};
		}

		// Check DDG cache as well
		const ddgCacheKey = `ddg:${query}:${count}`;
		const cachedDDG = searchCache.get(ddgCacheKey);
		if (cachedDDG) {
			return {
				status: 'SUCCESS' as const,
				provider: 'ddg' as const,
				cached: true,
				results: cachedDDG,
				resultCount: cachedDDG.length
			};
		}

		// Try TinyFish first
		try {
			const results = await tinyfishSearch(query, { count, region });
			searchCache.set(tinyfishCacheKey, results);
			return {
				status: 'SUCCESS' as const,
				provider: 'tinyfish' as const,
				cached: false,
				results,
				resultCount: results.length
			};
		} catch (error) {
			if (!(error instanceof TinyfishUnavailableError)) {
				// Unexpected error — still try fallback
			}
		}

		// Fallback to DuckDuckGo
		try {
			const results = await ddgSearch(query, { count });
			// Normalize DDG results to SearchResult interface
			const normalized: SearchResult[] = results.map((r) => ({
				title: r.title.slice(0, 200),
				url: r.url,
				snippet: r.snippet.slice(0, 300),
				domain: r.domain
			}));
			searchCache.set(ddgCacheKey, normalized);
			return {
				status: 'SUCCESS' as const,
				provider: 'ddg' as const,
				cached: false,
				results: normalized,
				resultCount: normalized.length
			};
		} catch (error) {
			const reason =
				error instanceof DDGBotChallengeError
					? 'DuckDuckGo returned a bot-challenge page'
					: error instanceof Error
						? error.message
						: 'Unknown error';

			return {
				status: 'SEARCH_UNAVAILABLE' as const,
				provider: null,
				cached: false,
				results: [],
				resultCount: 0,
				error: reason
			};
		}
	}
});

// ─── Web Fetch Tool ─────────────────────────────────────────────────────────────

export const webFetchTool = createTool({
	id: 'web-fetch',
	description:
		'Fetch and read content from a web page. Returns the page content as markdown or plain text with metadata. Use for reading specific URLs found in search results or provided by users.',
	inputSchema: z.object({
		url: z.string().url(),
		extractMode: z.enum(['markdown', 'text']).default('markdown'),
		maxChars: z.number().int().min(1).max(100000).default(20000)
	}),
	execute: async ({ url, extractMode, maxChars }) => {
		// SSRF validation
		const ssrfError = validateUrlForSSRF(url);
		if (ssrfError) {
			return {
				status: 'INVALID_URL' as const,
				error: ssrfError,
				content: null,
				title: null,
				url,
				charCount: 0,
				truncated: false
			};
		}

		// Check cache
		const cacheKey = `${url}:${extractMode}`;
		const cached = fetchCache.get(cacheKey);
		if (cached) {
			// Apply maxChars truncation to cached content
			const truncated = cached.content.length > maxChars;
			const content = truncated ? cached.content.slice(0, maxChars) : cached.content;
			return {
				status: 'SUCCESS' as const,
				cached: true,
				content,
				title: cached.title,
				url: cached.url,
				charCount: content.length,
				truncated
			};
		}

		// Try TinyFish fetch first
		try {
			const result = await tinyfishFetch(url, { extractMode, maxChars });
			// Cache the full result (before maxChars truncation applied by TinyFish)
			fetchCache.set(cacheKey, result);
			return {
				status: 'SUCCESS' as const,
				cached: false,
				content: result.content,
				title: result.title,
				url: result.url,
				charCount: result.charCount,
				truncated: result.truncated
			};
		} catch (error) {
			if (!(error instanceof TinyfishUnavailableError)) {
				// Unexpected error — still try fallback
			}
		}

		// Fallback: HTTP GET with HTML-to-markdown extraction
		try {
			const result = await httpFetchFallback(url, extractMode, maxChars);
			if (result.status === 'SUCCESS') {
				fetchCache.set(cacheKey, {
					content: result.content!,
					title: result.title || '',
					url: result.url,
					charCount: result.charCount,
					truncated: result.truncated
				});
			}
			return result;
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'Unknown error';
			return {
				status: 'FETCH_FAILED' as const,
				error: reason,
				content: null,
				title: null,
				url,
				charCount: 0,
				truncated: false
			};
		}
	}
});

// ─── HTTP Fetch Fallback ────────────────────────────────────────────────────────

interface FetchToolResult {
	status: 'SUCCESS' | 'FETCH_REQUIRES_JS' | 'FETCH_FAILED';
	error?: string;
	content: string | null;
	title: string | null;
	url: string;
	charCount: number;
	truncated: boolean;
	statusCode?: number;
}

/**
 * HTTP GET fallback for web page fetching.
 * Sends a GET request with browser UA, extracts content via htmlToMarkdown for HTML,
 * returns directly for non-HTML content types.
 */
async function httpFetchFallback(
	url: string,
	extractMode: 'markdown' | 'text',
	maxChars: number
): Promise<FetchToolResult> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT);

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'User-Agent': CHROME_UA,
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
			},
			signal: controller.signal,
			redirect: 'follow' // Allow HTTPS→HTTP redirects
		});

		if (!response.ok) {
			return {
				status: 'FETCH_FAILED',
				error: `HTTP ${response.status} ${response.statusText}`,
				statusCode: response.status,
				content: null,
				title: null,
				url,
				charCount: 0,
				truncated: false
			};
		}

		const contentType = response.headers.get('content-type') || '';
		const isHTML = contentType.includes('text/html') || contentType.includes('application/xhtml');

		// Read body with size limit
		let bodyText: string;
		try {
			bodyText = await readResponseWithLimit(response, MAX_BODY_SIZE);
		} catch (error) {
			if (error instanceof BodyTooLargeError) {
				// Body exceeded 750KB — use what we got
				bodyText = error.partialBody;
			} else {
				throw error;
			}
		}

		if (!isHTML) {
			// Non-HTML (JSON, plain text) — return directly
			const truncated = bodyText.length > maxChars;
			const content = truncated ? bodyText.slice(0, maxChars) : bodyText;
			return {
				status: 'SUCCESS',
				content,
				title: null,
				url,
				charCount: content.length,
				truncated
			};
		}

		// HTML content — extract via htmlToMarkdown
		let extracted: string;
		if (extractMode === 'markdown') {
			extracted = htmlToMarkdown(bodyText);
		} else {
			// Text mode: strip all HTML, just get text content
			extracted = htmlToMarkdown(bodyText).replace(/[#*\[\]()>`_~|\\-]/g, '');
		}

		// Check minimum content threshold
		if (extracted.length < 100) {
			return {
				status: 'FETCH_REQUIRES_JS',
				error: 'Page content is too short — the page likely requires JavaScript rendering',
				content: null,
				title: null,
				url,
				charCount: extracted.length,
				truncated: false
			};
		}

		// Extract title from HTML
		const titleMatch = bodyText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
		const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : null;

		// Apply maxChars truncation
		const truncated = extracted.length > maxChars;
		const content = truncated ? extracted.slice(0, maxChars) : extracted;

		return {
			status: 'SUCCESS',
			content,
			title,
			url,
			charCount: content.length,
			truncated
		};
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			return {
				status: 'FETCH_FAILED',
				error: `Request timed out after ${HTTP_TIMEOUT}ms`,
				content: null,
				title: null,
				url,
				charCount: 0,
				truncated: false
			};
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

// ─── Body Size Limiting ─────────────────────────────────────────────────────────

class BodyTooLargeError extends Error {
	constructor(public partialBody: string) {
		super('Response body exceeded maximum size');
		this.name = 'BodyTooLargeError';
	}
}

/**
 * Read a response body as text, aborting if it exceeds maxBytes.
 * Returns the text content. Throws BodyTooLargeError with partial content if exceeded.
 */
async function readResponseWithLimit(response: Response, maxBytes: number): Promise<string> {
	// If content-length is available and within limit, read directly
	const contentLength = response.headers.get('content-length');
	if (contentLength && parseInt(contentLength, 10) <= maxBytes) {
		return response.text();
	}

	// Stream the body and abort if too large
	if (!response.body) {
		return response.text();
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let accumulated = '';
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			totalBytes += value.byteLength;
			accumulated += decoder.decode(value, { stream: true });

			if (totalBytes > maxBytes) {
				reader.cancel();
				throw new BodyTooLargeError(accumulated);
			}
		}
		// Flush the decoder
		accumulated += decoder.decode();
	} catch (error) {
		if (error instanceof BodyTooLargeError) throw error;
		throw error;
	}

	return accumulated;
}

// ─── Exports ────────────────────────────────────────────────────────────────────

/** Global tools object for Gateway injection — always available regardless of active skill */
export const globalTools = {
	'web-search': webSearchTool,
	'web-fetch': webFetchTool
};

// Export caches for testing purposes
export { searchCache, fetchCache };
