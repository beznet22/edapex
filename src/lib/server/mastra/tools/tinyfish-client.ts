// Verified: no native Mastra web search/fetch tool as of @mastra/core@0.10.2.
// Custom TinyFish client with sliding-window rate limiting for search and fetch operations.

import { env } from '$env/dynamic/private';

// ─── Error Types ────────────────────────────────────────────────────────────────

/**
 * Thrown when the TinyFish API key is not configured or the service is unreachable.
 * The Global Tools module catches this to trigger the DuckDuckGo/HTTP fallback chain.
 */
export class TinyfishUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TinyfishUnavailableError';
	}
}

// ─── Rate Limiter ───────────────────────────────────────────────────────────────

/**
 * Sliding-window rate limiter that tracks timestamps of recent calls
 * and rejects new calls when the window limit is exceeded.
 */
export class SlidingWindowRateLimiter {
	private timestamps: number[] = [];

	constructor(
		private maxCalls: number,
		private windowMs: number
	) {}

	/**
	 * Check if a new call can proceed without exceeding the rate limit.
	 */
	canProceed(): boolean {
		this.prune();
		return this.timestamps.length < this.maxCalls;
	}

	/**
	 * Record a new call timestamp. Should be called after a successful canProceed() check.
	 */
	record(): void {
		this.timestamps.push(Date.now());
	}

	/**
	 * Remove timestamps that have fallen outside the sliding window.
	 */
	private prune(): void {
		const cutoff = Date.now() - this.windowMs;
		this.timestamps = this.timestamps.filter((t) => t > cutoff);
	}

	/**
	 * Get the number of calls recorded in the current window. Useful for testing.
	 */
	get currentCount(): number {
		this.prune();
		return this.timestamps.length;
	}

	/**
	 * Reset the rate limiter state. Useful for testing.
	 */
	reset(): void {
		this.timestamps = [];
	}
}

// Rate limiters: 5 search/min, 25 fetch/min
export const searchRateLimiter = new SlidingWindowRateLimiter(5, 60_000);
export const fetchRateLimiter = new SlidingWindowRateLimiter(25, 60_000);

// ─── Interfaces ─────────────────────────────────────────────────────────────────

export interface TinyfishSearchOptions {
	count?: number; // 1-10, default 5
	region?: string; // ISO 3166-1 alpha-2
	timeout?: number; // ms, default 10000
}

export interface TinyfishFetchOptions {
	extractMode?: 'markdown' | 'text'; // default 'markdown'
	maxChars?: number; // 1-100000, default 20000
	timeout?: number; // ms, default 15000
}

export interface SearchResult {
	title: string; // max 200 chars
	url: string;
	snippet: string; // max 300 chars
	domain: string;
}

export interface FetchResult {
	content: string;
	title: string;
	url: string;
	charCount: number;
	truncated: boolean;
}

// ─── Helper Functions ───────────────────────────────────────────────────────────

function getApiKey(): string {
	const apiKey = env.TINYFISH_API_KEY;
	if (!apiKey) {
		throw new TinyfishUnavailableError(
			'TINYFISH_API_KEY is not configured. Falling back to alternative provider.'
		);
	}
	return apiKey;
}

// ─── Search ─────────────────────────────────────────────────────────────────────

/**
 * Search the web using the TinyFish search API.
 *
 * - GET https://api.search.tinyfish.ai?q={query}&count={count}&region={region}
 * - Requires X-API-Key header
 * - 10s default timeout
 * - Rate limited to 5 calls/minute
 */
export async function tinyfishSearch(
	query: string,
	options?: TinyfishSearchOptions
): Promise<SearchResult[]> {
	const apiKey = getApiKey();

	if (!searchRateLimiter.canProceed()) {
		throw new TinyfishUnavailableError('TinyFish search rate limit exceeded (5/min).');
	}

	const count = options?.count ?? 5;
	const timeout = options?.timeout ?? 10_000;

	const url = new URL('https://api.search.tinyfish.ai');
	url.searchParams.set('q', query);
	url.searchParams.set('count', String(count));
	if (options?.region) {
		url.searchParams.set('region', options.region);
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		searchRateLimiter.record();

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				'X-API-Key': apiKey,
				Accept: 'application/json'
			},
			signal: controller.signal
		});

		if (!response.ok) {
			throw new TinyfishUnavailableError(
				`TinyFish search returned HTTP ${response.status}: ${response.statusText}`
			);
		}

		const data = await response.json();

		// Normalize results to match SearchResult interface
		const results: SearchResult[] = (data.results || data || [])
			.slice(0, count)
			.map((item: Record<string, unknown>) => ({
				title: String(item.title || '').slice(0, 200),
				url: String(item.url || ''),
				snippet: String(item.snippet || item.description || '').slice(0, 300),
				domain: String(item.domain || extractDomain(String(item.url || '')))
			}));

		return results;
	} catch (error) {
		if (error instanceof TinyfishUnavailableError) {
			throw error;
		}
		if (error instanceof Error && error.name === 'AbortError') {
			throw new TinyfishUnavailableError(`TinyFish search timed out after ${timeout}ms.`);
		}
		throw new TinyfishUnavailableError(
			`TinyFish search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	} finally {
		clearTimeout(timeoutId);
	}
}

// ─── Fetch ──────────────────────────────────────────────────────────────────────

/**
 * Fetch and extract content from a URL using the TinyFish fetch API.
 *
 * - POST https://api.fetch.tinyfish.ai with { urls: [url] } body
 * - Requires X-API-Key header
 * - 15s default timeout
 * - Rate limited to 25 calls/minute
 */
export async function tinyfishFetch(
	url: string,
	options?: TinyfishFetchOptions
): Promise<FetchResult> {
	const apiKey = getApiKey();

	if (!fetchRateLimiter.canProceed()) {
		throw new TinyfishUnavailableError('TinyFish fetch rate limit exceeded (25/min).');
	}

	const extractMode = options?.extractMode ?? 'markdown';
	const maxChars = options?.maxChars ?? 20_000;
	const timeout = options?.timeout ?? 15_000;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		fetchRateLimiter.record();

		const response = await fetch('https://api.fetch.tinyfish.ai', {
			method: 'POST',
			headers: {
				'X-API-Key': apiKey,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				urls: [url],
				extractMode,
				maxChars
			}),
			signal: controller.signal
		});

		if (!response.ok) {
			throw new TinyfishUnavailableError(
				`TinyFish fetch returned HTTP ${response.status}: ${response.statusText}`
			);
		}

		const data = await response.json();

		// TinyFish returns an array of results (one per URL)
		const result = Array.isArray(data.results) ? data.results[0] : Array.isArray(data) ? data[0] : data;

		const content = String(result?.content || result?.markdown || result?.text || '');
		const truncated = content.length > maxChars;
		const finalContent = truncated ? content.slice(0, maxChars) : content;

		return {
			content: finalContent,
			title: String(result?.title || ''),
			url: String(result?.url || url),
			charCount: finalContent.length,
			truncated
		};
	} catch (error) {
		if (error instanceof TinyfishUnavailableError) {
			throw error;
		}
		if (error instanceof Error && error.name === 'AbortError') {
			throw new TinyfishUnavailableError(`TinyFish fetch timed out after ${timeout}ms.`);
		}
		throw new TinyfishUnavailableError(
			`TinyFish fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	} finally {
		clearTimeout(timeoutId);
	}
}

// ─── Utilities ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
}
