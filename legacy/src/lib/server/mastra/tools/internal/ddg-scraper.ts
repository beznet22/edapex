// Verified: no native Mastra web search/fetch tool as of @mastra/core@1.32.1.
// Custom DuckDuckGo HTML scraper as fallback search provider.

import { parseSearchResults, htmlToMarkdown, type WebSearchResult } from './html-to-markdown';

const DDG_ENDPOINT = 'https://html.duckduckgo.com/html';
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_COUNT = 5;
const CHROME_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Error thrown when DuckDuckGo returns a bot-challenge page
 * instead of search results.
 */
export class DDGBotChallengeError extends Error {
	constructor(message = 'DuckDuckGo returned a bot-challenge page') {
		super(message);
		this.name = 'DDGBotChallengeError';
	}
}

export interface DDGSearchOptions {
	/** Maximum number of results to extract (default 5) */
	count?: number;
	/** Request timeout in milliseconds (default 10000) */
	timeout?: number;
}

/**
 * Detect whether the HTML response is a bot-challenge page.
 * DDG bot challenges typically contain CAPTCHA forms or specific challenge patterns.
 */
function isBotChallengePage(html: string): boolean {
	// DDG challenge pages contain specific patterns
	const challengeIndicators = [
		'<form id="challenge-form"',
		'<input type="hidden" name="dc"',
		'Please click to continue',
		'bot-challenge',
		'g-recaptcha',
		'h-captcha',
		'challenge-error-text'
	];

	const lowerHtml = html.toLowerCase();
	return challengeIndicators.some((indicator) => lowerHtml.includes(indicator.toLowerCase()));
}

/**
 * Search DuckDuckGo via its HTML endpoint and return structured results.
 *
 * POSTs to https://html.duckduckgo.com/html with a form body containing the query.
 * Parses the HTML response to extract search result containers.
 * Passes snippets through htmlToMarkdown for cleaning.
 *
 * @throws {DDGBotChallengeError} When DDG returns a bot-challenge page
 * @throws {Error} On network failure, non-200 status, or timeout
 */
export async function ddgSearch(
	query: string,
	options?: DDGSearchOptions
): Promise<WebSearchResult[]> {
	const count = options?.count ?? DEFAULT_COUNT;
	const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const formBody = new URLSearchParams({ q: query });

		const response = await fetch(DDG_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': CHROME_UA
			},
			body: formBody.toString(),
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
		}

		const html = await response.text();

		// Detect bot-challenge pages before parsing
		if (isBotChallengePage(html)) {
			throw new DDGBotChallengeError();
		}

		// Use parseSearchResults from html-to-markdown module to extract results
		const results = parseSearchResults(html, count);

		// Clean snippets through htmlToMarkdown
		return results.map((result) => ({
			...result,
			snippet: result.snippet ? htmlToMarkdown(result.snippet).slice(0, 300) : ''
		}));
	} catch (error) {
		if (error instanceof DDGBotChallengeError) {
			throw error;
		}
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(`DuckDuckGo search timed out after ${timeout}ms`);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}
