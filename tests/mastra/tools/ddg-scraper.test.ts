import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ddgSearch, DDGBotChallengeError } from '$lib/server/mastra/tools/ddg-scraper';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/**
 * Helper to create a minimal DDG HTML response with result containers.
 */
function makeDDGHtml(results: Array<{ title: string; url: string; snippet: string }>): string {
	const resultBlocks = results
		.map(
			(r) => `
		<div class="result">
			<a class="result__a" href="/l/?uddg=${encodeURIComponent(r.url)}&rut=abc123">${r.title}</a>
			<a class="result__snippet">${r.snippet}</a>
		</div>
	`
		)
		.join('\n');

	return `<!DOCTYPE html><html><body><div class="results">${resultBlocks}</div></body></html>`;
}

/**
 * Helper to create a bot-challenge page HTML.
 */
function makeBotChallengePage(): string {
	return `<!DOCTYPE html><html><body>
		<form id="challenge-form" action="/challenge">
			<input type="hidden" name="dc" value="abc123" />
			<p>Please click to continue</p>
			<button type="submit">Continue</button>
		</form>
	</body></html>`;
}

describe('ddgSearch', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('request construction', () => {
		it('sends POST request to DDG HTML endpoint with correct form body', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(makeDDGHtml([]))
			});

			await ddgSearch('test query');

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toBe('https://html.duckduckgo.com/html');
			expect(options.method).toBe('POST');
			expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
			expect(options.body).toBe('q=test+query');
		});

		it('sends standard Chrome User-Agent header', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(makeDDGHtml([]))
			});

			await ddgSearch('test');

			const [, options] = mockFetch.mock.calls[0];
			expect(options.headers['User-Agent']).toContain('Chrome/120.0.0.0');
			expect(options.headers['User-Agent']).toContain('Mozilla/5.0');
		});

		it('includes AbortSignal for timeout control', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(makeDDGHtml([]))
			});

			await ddgSearch('test');

			const [, options] = mockFetch.mock.calls[0];
			expect(options.signal).toBeInstanceOf(AbortSignal);
		});
	});

	describe('bot challenge detection', () => {
		it('throws DDGBotChallengeError when response contains challenge form', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(makeBotChallengePage())
			});

			await expect(ddgSearch('test')).rejects.toThrow(DDGBotChallengeError);
		});

		it('throws DDGBotChallengeError with descriptive message', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(makeBotChallengePage())
			});

			await expect(ddgSearch('test')).rejects.toThrow(
				'DuckDuckGo returned a bot-challenge page'
			);
		});

		it('detects g-recaptcha challenge pages', async () => {
			const captchaHtml = `<html><body><div class="g-recaptcha" data-sitekey="abc"></div></body></html>`;
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(captchaHtml)
			});

			await expect(ddgSearch('test')).rejects.toThrow(DDGBotChallengeError);
		});

		it('detects h-captcha challenge pages', async () => {
			const captchaHtml = `<html><body><div class="h-captcha" data-sitekey="abc"></div></body></html>`;
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(captchaHtml)
			});

			await expect(ddgSearch('test')).rejects.toThrow(DDGBotChallengeError);
		});

		it('does not throw for normal search results', async () => {
			const html = makeDDGHtml([
				{ title: 'Result 1', url: 'https://example.com', snippet: 'A snippet' }
			]);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			});

			await expect(ddgSearch('test')).resolves.not.toThrow();
		});
	});

	describe('result extraction', () => {
		it('extracts results from DDG HTML response', async () => {
			const html = makeDDGHtml([
				{ title: 'Example Site', url: 'https://example.com/page', snippet: 'A description' },
				{ title: 'Another Site', url: 'https://another.org', snippet: 'More info' }
			]);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			});

			const results = await ddgSearch('test');

			expect(results).toHaveLength(2);
			expect(results[0].title).toBe('Example Site');
			expect(results[0].url).toBe('https://example.com/page');
			expect(results[0].domain).toBe('example.com');
			expect(results[1].title).toBe('Another Site');
			expect(results[1].url).toBe('https://another.org');
		});

		it('respects count option to limit results', async () => {
			const html = makeDDGHtml([
				{ title: 'Result 1', url: 'https://a.com', snippet: 'Snippet 1' },
				{ title: 'Result 2', url: 'https://b.com', snippet: 'Snippet 2' },
				{ title: 'Result 3', url: 'https://c.com', snippet: 'Snippet 3' }
			]);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			});

			const results = await ddgSearch('test', { count: 2 });

			expect(results).toHaveLength(2);
		});

		it('defaults to 5 results when count is not specified', async () => {
			const items = Array.from({ length: 8 }, (_, i) => ({
				title: `Result ${i + 1}`,
				url: `https://site${i}.com`,
				snippet: `Snippet ${i + 1}`
			}));
			const html = makeDDGHtml(items);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			});

			const results = await ddgSearch('test');

			expect(results).toHaveLength(5);
		});

		it('returns empty array when no results found', async () => {
			const html = `<!DOCTYPE html><html><body><div class="results"><p>No results</p></div></body></html>`;
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			});

			const results = await ddgSearch('test');

			expect(results).toEqual([]);
		});

		it('cleans snippets through htmlToMarkdown', async () => {
			const html = makeDDGHtml([
				{
					title: 'Test',
					url: 'https://example.com',
					snippet: '<b>Bold</b> text with <em>emphasis</em>'
				}
			]);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			});

			const results = await ddgSearch('test');

			// htmlToMarkdown converts <b> to ** and <em> to *
			expect(results[0].snippet).toContain('Bold');
			expect(results[0].snippet).toContain('emphasis');
			// Should not contain raw HTML tags
			expect(results[0].snippet).not.toContain('<b>');
			expect(results[0].snippet).not.toContain('<em>');
		});

		it('truncates snippets to 300 characters', async () => {
			const longSnippet = 'A'.repeat(500);
			const html = makeDDGHtml([
				{ title: 'Test', url: 'https://example.com', snippet: longSnippet }
			]);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			});

			const results = await ddgSearch('test');

			expect(results[0].snippet.length).toBeLessThanOrEqual(300);
		});
	});

	describe('timeout handling', () => {
		it('uses default 10s timeout', async () => {
			mockFetch.mockImplementationOnce(
				(_url: string, options: { signal: AbortSignal }) =>
					new Promise((_, reject) => {
						options.signal.addEventListener('abort', () => {
							reject(new DOMException('The operation was aborted.', 'AbortError'));
						});
					})
			);

			const promise = ddgSearch('test');
			vi.advanceTimersByTime(10_001);

			await expect(promise).rejects.toThrow('DuckDuckGo search timed out after 10000ms');
		});

		it('respects custom timeout option', async () => {
			mockFetch.mockImplementationOnce(
				(_url: string, options: { signal: AbortSignal }) =>
					new Promise((_, reject) => {
						options.signal.addEventListener('abort', () => {
							reject(new DOMException('The operation was aborted.', 'AbortError'));
						});
					})
			);

			const promise = ddgSearch('test', { timeout: 5000 });
			vi.advanceTimersByTime(5001);

			await expect(promise).rejects.toThrow('DuckDuckGo search timed out after 5000ms');
		});

		it('does not timeout when response arrives in time', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(makeDDGHtml([]))
			});

			const result = await ddgSearch('test', { timeout: 5000 });
			expect(result).toEqual([]);
		});
	});

	describe('error cases', () => {
		it('throws on non-200 HTTP status', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 503,
				text: () => Promise.resolve('')
			});

			await expect(ddgSearch('test')).rejects.toThrow('DuckDuckGo returned HTTP 503');
		});

		it('throws on network failure', async () => {
			mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

			await expect(ddgSearch('test')).rejects.toThrow('fetch failed');
		});

		it('throws on DNS resolution failure', async () => {
			mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND html.duckduckgo.com'));

			await expect(ddgSearch('test')).rejects.toThrow('ENOTFOUND');
		});

		it('preserves DDGBotChallengeError type through catch', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(makeBotChallengePage())
			});

			try {
				await ddgSearch('test');
				expect.fail('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(DDGBotChallengeError);
				expect((error as Error).name).toBe('DDGBotChallengeError');
			}
		});
	});
});
