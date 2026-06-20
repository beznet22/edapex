import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	SlidingWindowRateLimiter,
	TinyfishUnavailableError
} from '$lib/server/mastra/tools/internal/tinyfish-client';

// Mock $env/dynamic/private
vi.mock('$env/dynamic/private', () => ({
	env: {
		TINYFISH_API_KEY: 'test-api-key-123'
	}
}));

describe('TinyFish Client', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('SlidingWindowRateLimiter', () => {
		it('allows calls within the limit', () => {
			const limiter = new SlidingWindowRateLimiter(5, 60_000);
			for (let i = 0; i < 5; i++) {
				expect(limiter.canProceed()).toBe(true);
				limiter.record();
			}
		});

		it('rejects calls exceeding the limit', () => {
			const limiter = new SlidingWindowRateLimiter(5, 60_000);
			for (let i = 0; i < 5; i++) {
				limiter.record();
			}
			expect(limiter.canProceed()).toBe(false);
		});

		it('allows calls after the window slides', () => {
			const limiter = new SlidingWindowRateLimiter(5, 60_000);
			for (let i = 0; i < 5; i++) {
				limiter.record();
			}
			expect(limiter.canProceed()).toBe(false);

			// Advance past the window
			vi.advanceTimersByTime(60_001);
			expect(limiter.canProceed()).toBe(true);
		});

		it('slides the window correctly with staggered calls', () => {
			const limiter = new SlidingWindowRateLimiter(3, 60_000);

			limiter.record(); // t=0
			vi.advanceTimersByTime(20_000);
			limiter.record(); // t=20s
			vi.advanceTimersByTime(20_000);
			limiter.record(); // t=40s

			expect(limiter.canProceed()).toBe(false); // 3/3 used

			// Advance to t=60.001s — first call (t=0) falls out of window
			vi.advanceTimersByTime(20_001);
			expect(limiter.canProceed()).toBe(true);
			expect(limiter.currentCount).toBe(2);
		});

		it('reports correct currentCount', () => {
			const limiter = new SlidingWindowRateLimiter(10, 60_000);
			expect(limiter.currentCount).toBe(0);

			limiter.record();
			limiter.record();
			expect(limiter.currentCount).toBe(2);

			vi.advanceTimersByTime(60_001);
			expect(limiter.currentCount).toBe(0);
		});

		it('reset clears all timestamps', () => {
			const limiter = new SlidingWindowRateLimiter(5, 60_000);
			for (let i = 0; i < 5; i++) {
				limiter.record();
			}
			expect(limiter.canProceed()).toBe(false);

			limiter.reset();
			expect(limiter.canProceed()).toBe(true);
			expect(limiter.currentCount).toBe(0);
		});

		it('handles window of 1 call', () => {
			const limiter = new SlidingWindowRateLimiter(1, 60_000);
			expect(limiter.canProceed()).toBe(true);
			limiter.record();
			expect(limiter.canProceed()).toBe(false);

			vi.advanceTimersByTime(60_001);
			expect(limiter.canProceed()).toBe(true);
		});

		it('handles very short window', () => {
			const limiter = new SlidingWindowRateLimiter(5, 100); // 100ms window
			for (let i = 0; i < 5; i++) {
				limiter.record();
			}
			expect(limiter.canProceed()).toBe(false);

			vi.advanceTimersByTime(101);
			expect(limiter.canProceed()).toBe(true);
		});
	});

	describe('TinyfishUnavailableError', () => {
		it('has correct name property', () => {
			const error = new TinyfishUnavailableError('test message');
			expect(error.name).toBe('TinyfishUnavailableError');
		});

		it('has correct message', () => {
			const error = new TinyfishUnavailableError('API key missing');
			expect(error.message).toBe('API key missing');
		});

		it('is an instance of Error', () => {
			const error = new TinyfishUnavailableError('test');
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe('tinyfishSearch', () => {
		let tinyfishSearch: typeof import('$lib/server/mastra/tools/internal/tinyfish-client').tinyfishSearch;
		let searchRateLimiter: typeof import('$lib/server/mastra/tools/internal/tinyfish-client').searchRateLimiter;

		beforeEach(async () => {
			vi.stubGlobal('fetch', vi.fn());
			const mod = await import('$lib/server/mastra/tools/internal/tinyfish-client');
			tinyfishSearch = mod.tinyfishSearch;
			searchRateLimiter = mod.searchRateLimiter;
			searchRateLimiter.reset();
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('constructs correct URL with query and default count', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ results: [] })
			});
			vi.stubGlobal('fetch', mockFetch);

			await tinyfishSearch('react hooks');

			const [url, options] = mockFetch.mock.calls[0];
			const parsedUrl = new URL(url);
			expect(parsedUrl.origin).toBe('https://api.search.tinyfish.ai');
			expect(parsedUrl.searchParams.get('q')).toBe('react hooks');
			expect(parsedUrl.searchParams.get('count')).toBe('5');
			expect(parsedUrl.searchParams.get('region')).toBeNull();
			expect(options.method).toBe('GET');
		});

		it('includes region parameter when provided', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ results: [] })
			});
			vi.stubGlobal('fetch', mockFetch);

			await tinyfishSearch('test', { count: 3, region: 'US' });

			const [url] = mockFetch.mock.calls[0];
			const parsedUrl = new URL(url);
			expect(parsedUrl.searchParams.get('count')).toBe('3');
			expect(parsedUrl.searchParams.get('region')).toBe('US');
		});

		it('sends X-API-Key header', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ results: [] })
			});
			vi.stubGlobal('fetch', mockFetch);

			await tinyfishSearch('test');

			const [, options] = mockFetch.mock.calls[0];
			expect(options.headers['X-API-Key']).toBe('test-api-key-123');
		});

		it('normalizes results to SearchResult interface', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [
							{
								title: 'React Hooks Guide',
								url: 'https://react.dev/hooks',
								snippet: 'Learn about React hooks',
								domain: 'react.dev'
							}
						]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const results = await tinyfishSearch('react hooks');

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				title: 'React Hooks Guide',
				url: 'https://react.dev/hooks',
				snippet: 'Learn about React hooks',
				domain: 'react.dev'
			});
		});

		it('truncates title to 200 chars and snippet to 300 chars', async () => {
			const longTitle = 'A'.repeat(250);
			const longSnippet = 'B'.repeat(400);
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [
							{
								title: longTitle,
								url: 'https://example.com',
								snippet: longSnippet,
								domain: 'example.com'
							}
						]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const results = await tinyfishSearch('test');

			expect(results[0].title.length).toBe(200);
			expect(results[0].snippet.length).toBe(300);
		});

		it('extracts domain from URL when not provided', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [
							{
								title: 'Test',
								url: 'https://docs.example.com/path',
								snippet: 'Test snippet'
							}
						]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const results = await tinyfishSearch('test');

			expect(results[0].domain).toBe('docs.example.com');
		});

		it('throws TinyfishUnavailableError on non-OK response', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error'
			});
			vi.stubGlobal('fetch', mockFetch);

			await expect(tinyfishSearch('test')).rejects.toThrow(TinyfishUnavailableError);
			await expect(tinyfishSearch('test')).rejects.toThrow(/HTTP 500/);
		});

		it('throws TinyfishUnavailableError on timeout', async () => {
			vi.useRealTimers();
			const mockFetch = vi.fn().mockImplementation((_url, opts) => {
				return new Promise((_, reject) => {
					opts.signal.addEventListener('abort', () => {
						const err = new Error('The operation was aborted');
						err.name = 'AbortError';
						reject(err);
					});
				});
			});
			vi.stubGlobal('fetch', mockFetch);

			// Use a very short timeout so the test completes quickly
			await expect(tinyfishSearch('test', { timeout: 50 })).rejects.toThrow(
				TinyfishUnavailableError
			);
			await expect(tinyfishSearch('test', { timeout: 50 })).rejects.toThrow(/timed out/);
			vi.useFakeTimers();
		});

		it('throws TinyfishUnavailableError when rate limited', async () => {
			// Exhaust the rate limit
			for (let i = 0; i < 5; i++) {
				searchRateLimiter.record();
			}

			await expect(tinyfishSearch('test')).rejects.toThrow(TinyfishUnavailableError);
			await expect(tinyfishSearch('test')).rejects.toThrow(/rate limit/);
		});

		it('respects count option to limit results', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: Array.from({ length: 10 }, (_, i) => ({
							title: `Result ${i}`,
							url: `https://example.com/${i}`,
							snippet: `Snippet ${i}`,
							domain: 'example.com'
						}))
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const results = await tinyfishSearch('test', { count: 3 });

			expect(results).toHaveLength(3);
		});
	});

	describe('tinyfishFetch', () => {
		let tinyfishFetch: typeof import('$lib/server/mastra/tools/internal/tinyfish-client').tinyfishFetch;
		let fetchRateLimiter: typeof import('$lib/server/mastra/tools/internal/tinyfish-client').fetchRateLimiter;

		beforeEach(async () => {
			vi.stubGlobal('fetch', vi.fn());
			const mod = await import('$lib/server/mastra/tools/internal/tinyfish-client');
			tinyfishFetch = mod.tinyfishFetch;
			fetchRateLimiter = mod.fetchRateLimiter;
			fetchRateLimiter.reset();
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('sends POST request with correct body', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [{ content: 'Page content', title: 'Page', url: 'https://example.com' }]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			await tinyfishFetch('https://example.com');

			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toBe('https://api.fetch.tinyfish.ai');
			expect(options.method).toBe('POST');
			expect(options.headers['Content-Type']).toBe('application/json');
			expect(options.headers['X-API-Key']).toBe('test-api-key-123');

			const body = JSON.parse(options.body);
			expect(body.urls).toEqual(['https://example.com']);
			expect(body.extractMode).toBe('markdown');
			expect(body.maxChars).toBe(20_000);
		});

		it('uses custom options when provided', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [{ content: 'text', title: 'T', url: 'https://example.com' }]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			await tinyfishFetch('https://example.com', {
				extractMode: 'text',
				maxChars: 5000
			});

			const [, options] = mockFetch.mock.calls[0];
			const body = JSON.parse(options.body);
			expect(body.extractMode).toBe('text');
			expect(body.maxChars).toBe(5000);
		});

		it('returns FetchResult with correct structure', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [
							{
								content: 'Hello world content',
								title: 'Hello Page',
								url: 'https://example.com/hello'
							}
						]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await tinyfishFetch('https://example.com/hello');

			expect(result).toEqual({
				content: 'Hello world content',
				title: 'Hello Page',
				url: 'https://example.com/hello',
				charCount: 19,
				truncated: false
			});
		});

		it('truncates content exceeding maxChars', async () => {
			const longContent = 'X'.repeat(30_000);
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [{ content: longContent, title: 'Long', url: 'https://example.com' }]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await tinyfishFetch('https://example.com', { maxChars: 10_000 });

			expect(result.content.length).toBe(10_000);
			expect(result.charCount).toBe(10_000);
			expect(result.truncated).toBe(true);
		});

		it('does not truncate content within maxChars', async () => {
			const content = 'Short content';
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [{ content, title: 'Short', url: 'https://example.com' }]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await tinyfishFetch('https://example.com');

			expect(result.content).toBe(content);
			expect(result.truncated).toBe(false);
		});

		it('throws TinyfishUnavailableError on non-OK response', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				statusText: 'Too Many Requests'
			});
			vi.stubGlobal('fetch', mockFetch);

			await expect(tinyfishFetch('https://example.com')).rejects.toThrow(
				TinyfishUnavailableError
			);
		});

		it('throws TinyfishUnavailableError on timeout', async () => {
			vi.useRealTimers();
			const mockFetch = vi.fn().mockImplementation((_url, opts) => {
				return new Promise((_, reject) => {
					opts.signal.addEventListener('abort', () => {
						const err = new Error('The operation was aborted');
						err.name = 'AbortError';
						reject(err);
					});
				});
			});
			vi.stubGlobal('fetch', mockFetch);

			// Use a very short timeout so the test completes quickly
			await expect(tinyfishFetch('https://example.com', { timeout: 50 })).rejects.toThrow(
				TinyfishUnavailableError
			);
			vi.useFakeTimers();
		});

		it('throws TinyfishUnavailableError when rate limited', async () => {
			// Exhaust the rate limit (25 calls)
			for (let i = 0; i < 25; i++) {
				fetchRateLimiter.record();
			}

			await expect(tinyfishFetch('https://example.com')).rejects.toThrow(
				TinyfishUnavailableError
			);
			await expect(tinyfishFetch('https://example.com')).rejects.toThrow(/rate limit/);
		});

		it('uses original URL as fallback when response URL is missing', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [{ content: 'content', title: 'Title' }]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await tinyfishFetch('https://example.com/page');

			expect(result.url).toBe('https://example.com/page');
		});
	});

	describe('API key validation', () => {
		it('throws TinyfishUnavailableError when API key is missing', async () => {
			// Override the mock to return no API key
			vi.doMock('$env/dynamic/private', () => ({
				env: { TINYFISH_API_KEY: '' }
			}));

			// Re-import to get the module with the new mock
			const mod = await import('$lib/server/mastra/tools/internal/tinyfish-client');

			await expect(mod.tinyfishSearch('test')).rejects.toThrow(TinyfishUnavailableError);
			await expect(mod.tinyfishFetch('https://example.com')).rejects.toThrow(
				TinyfishUnavailableError
			);

			// Restore original mock
			vi.doMock('$env/dynamic/private', () => ({
				env: { TINYFISH_API_KEY: 'test-api-key-123' }
			}));
		});
	});
});
