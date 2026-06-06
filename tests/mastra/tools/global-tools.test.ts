import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateUrlForSSRF } from '$lib/server/mastra/tools/global-tools';

// Mock $env/dynamic/private
vi.mock('$env/dynamic/private', () => ({
	env: {
		TINYFISH_API_KEY: 'test-api-key-123'
	}
}));

describe('Global Tools', () => {
	describe('validateUrlForSSRF', () => {
		it('accepts valid HTTPS URLs', () => {
			expect(validateUrlForSSRF('https://example.com')).toBeNull();
			expect(validateUrlForSSRF('https://docs.google.com/page')).toBeNull();
			expect(validateUrlForSSRF('https://api.github.com/repos')).toBeNull();
		});

		it('rejects non-HTTPS URLs', () => {
			expect(validateUrlForSSRF('http://example.com')).toBe('Only HTTPS URLs are allowed');
			expect(validateUrlForSSRF('ftp://example.com')).toBe('Only HTTPS URLs are allowed');
		});

		it('rejects invalid URL format', () => {
			expect(validateUrlForSSRF('not-a-url')).toBe('Invalid URL format');
			expect(validateUrlForSSRF('')).toBe('Invalid URL format');
		});

		it('rejects localhost URLs', () => {
			const result = validateUrlForSSRF('https://localhost/path');
			expect(result).not.toBeNull();
			expect(result).toContain('localhost');
		});

		it('rejects 127.0.0.1', () => {
			const result = validateUrlForSSRF('https://127.0.0.1/path');
			expect(result).not.toBeNull();
		});

		it('rejects 127.x.x.x range', () => {
			const result = validateUrlForSSRF('https://127.0.0.2');
			expect(result).not.toBeNull();
		});

		it('rejects 10.x.x.x private range', () => {
			const r1 = validateUrlForSSRF('https://10.0.0.1');
			const r2 = validateUrlForSSRF('https://10.255.255.255');
			expect(r1).not.toBeNull();
			expect(r2).not.toBeNull();
		});

		it('rejects 172.16.x.x - 172.31.x.x private range', () => {
			const r1 = validateUrlForSSRF('https://172.16.0.1');
			const r2 = validateUrlForSSRF('https://172.31.255.255');
			expect(r1).not.toBeNull();
			expect(r1).toContain('private/reserved');
			expect(r2).not.toBeNull();
			expect(r2).toContain('private/reserved');
		});

		it('accepts 172.32.x.x (outside private range)', () => {
			expect(validateUrlForSSRF('https://172.32.0.1')).toBeNull();
		});

		it('rejects 192.168.x.x private range', () => {
			const r1 = validateUrlForSSRF('https://192.168.0.1');
			const r2 = validateUrlForSSRF('https://192.168.255.255');
			expect(r1).not.toBeNull();
			expect(r1).toContain('private/reserved');
			expect(r2).not.toBeNull();
			expect(r2).toContain('private/reserved');
		});

		it('accepts public IP addresses', () => {
			expect(validateUrlForSSRF('https://8.8.8.8')).toBeNull();
			expect(validateUrlForSSRF('https://1.1.1.1')).toBeNull();
			expect(validateUrlForSSRF('https://203.0.113.1')).toBeNull();
		});

		it('rejects ::1 (IPv6 localhost)', () => {
			const result = validateUrlForSSRF('https://[::1]/path');
			expect(result).not.toBeNull();
			expect(result).toContain('localhost');
		});
	});

	describe('webSearchTool', () => {
		let webSearchTool: any;
		let searchCache: typeof import('$lib/server/mastra/tools/global-tools').searchCache;

		beforeEach(async () => {
			vi.stubGlobal('fetch', vi.fn());
			const mod = await import('$lib/server/mastra/tools/global-tools');
			webSearchTool = mod.webSearchTool;
			searchCache = mod.searchCache;
			searchCache.clear();

			// Reset rate limiters
			const tinyfishMod = await import('$lib/server/mastra/tools/tinyfish-client');
			tinyfishMod.searchRateLimiter.reset();
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('returns cached results when available', async () => {
			const cachedResults = [
				{ title: 'Cached', url: 'https://example.com', snippet: 'cached result', domain: 'example.com' }
			];
			searchCache.set('tinyfish:test query:5', cachedResults);

			const result = await webSearchTool.execute({ query: 'test query', count: 5, region: undefined });

			expect(result.status).toBe('SUCCESS');
			expect(result.cached).toBe(true);
			expect(result.results).toEqual(cachedResults);
		});

		it('calls TinyFish as primary provider', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [
							{
								title: 'TinyFish Result',
								url: 'https://example.com',
								snippet: 'A snippet',
								domain: 'example.com'
							}
						]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await webSearchTool.execute({ query: 'react hooks', count: 5, region: undefined });

			expect(result.status).toBe('SUCCESS');
			expect(result.provider).toBe('tinyfish');
			expect(result.results).toHaveLength(1);
			expect(result.results[0].title).toBe('TinyFish Result');
		});

		it('falls back to DuckDuckGo when TinyFish fails', async () => {
			const mockFetch = vi.fn().mockImplementation((url: string) => {
				if (typeof url === 'string' && url.includes('tinyfish')) {
					return Promise.resolve({ ok: false, status: 500, statusText: 'Error' });
				}
				// DDG response
				return Promise.resolve({
					ok: true,
					text: () =>
						Promise.resolve(`
						<html><body>
							<div class="result">
								<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">DDG Result</a>
								<span class="result__snippet">A DDG snippet</span>
							</div>
						</body></html>
					`)
				});
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await webSearchTool.execute({ query: 'test', count: 5, region: undefined });

			expect(result.status).toBe('SUCCESS');
			expect(result.provider).toBe('ddg');
		});

		it('returns SEARCH_UNAVAILABLE when both providers fail', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error'
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await webSearchTool.execute({ query: 'test', count: 5, region: undefined });

			expect(result.status).toBe('SEARCH_UNAVAILABLE');
			expect(result.error).toBeDefined();
			expect(result.results).toEqual([]);
		});

		it('caches TinyFish results after successful fetch', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [
							{
								title: 'Result',
								url: 'https://example.com',
								snippet: 'Snippet',
								domain: 'example.com'
							}
						]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			await webSearchTool.execute({ query: 'cache test', count: 5, region: undefined });

			expect(searchCache.has('tinyfish:cache test:5')).toBe(true);
		});
	});

	describe('webFetchTool', () => {
		let webFetchTool: any;
		let fetchCache: typeof import('$lib/server/mastra/tools/global-tools').fetchCache;

		beforeEach(async () => {
			vi.stubGlobal('fetch', vi.fn());
			const mod = await import('$lib/server/mastra/tools/global-tools');
			webFetchTool = mod.webFetchTool;
			fetchCache = mod.fetchCache;
			fetchCache.clear();

			// Reset rate limiters
			const tinyfishMod = await import('$lib/server/mastra/tools/tinyfish-client');
			tinyfishMod.fetchRateLimiter.reset();
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('rejects non-HTTPS URLs with INVALID_URL status', async () => {
			const result = await webFetchTool.execute({
				url: 'http://example.com', extractMode: 'markdown', maxChars: 20000
			});

			expect(result.status).toBe('INVALID_URL');
			expect(result.error).toContain('HTTPS');
		});

		it('rejects localhost URLs', async () => {
			const result = await webFetchTool.execute({
				url: 'https://localhost/secret', extractMode: 'markdown', maxChars: 20000
			});

			expect(result.status).toBe('INVALID_URL');
			expect(result.error).toContain('localhost');
		});

		it('rejects private IP addresses', async () => {
			const result = await webFetchTool.execute({
				url: 'https://192.168.1.1/admin', extractMode: 'markdown', maxChars: 20000
			});

			expect(result.status).toBe('INVALID_URL');
			expect(result.error).toContain('private/reserved');
		});

		it('returns cached results when available', async () => {
			fetchCache.set('https://example.com:markdown', {
				content: 'Cached content here',
				title: 'Cached Page',
				url: 'https://example.com',
				charCount: 19,
				truncated: false
			});

			const result = await webFetchTool.execute({
				url: 'https://example.com', extractMode: 'markdown', maxChars: 20000
			});

			expect(result.status).toBe('SUCCESS');
			expect(result.cached).toBe(true);
			expect(result.content).toBe('Cached content here');
		});

		it('truncates cached content to maxChars', async () => {
			fetchCache.set('https://example.com:markdown', {
				content: 'A'.repeat(5000),
				title: 'Long Page',
				url: 'https://example.com',
				charCount: 5000,
				truncated: false
			});

			const result = await webFetchTool.execute({
				url: 'https://example.com', extractMode: 'markdown', maxChars: 100
			});

			expect(result.status).toBe('SUCCESS');
			expect(result.content!.length).toBe(100);
			expect(result.truncated).toBe(true);
		});

		it('calls TinyFish fetch as primary provider', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [
							{
								content: 'Page content from TinyFish',
								title: 'TinyFish Page',
								url: 'https://example.com'
							}
						]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await webFetchTool.execute({
				url: 'https://example.com', extractMode: 'markdown', maxChars: 20000
			});

			expect(result.status).toBe('SUCCESS');
			expect(result.content).toBe('Page content from TinyFish');
			expect(result.title).toBe('TinyFish Page');
		});

		it('falls back to HTTP GET when TinyFish fails', async () => {
			const htmlContent =
				'<html><head><title>Test Page</title></head><body><p>This is a test page with enough content to pass the 100 character minimum threshold for JavaScript rendering detection check that we need.</p></body></html>';
			const mockResponse = {
				ok: true,
				status: 200,
				statusText: 'OK',
				headers: {
					get: (name: string) => {
						if (name === 'content-type') return 'text/html; charset=utf-8';
						if (name === 'content-length') return String(htmlContent.length);
						return null;
					}
				},
				body: null,
				text: () => Promise.resolve(htmlContent)
			};

			const mockFetch = vi.fn().mockImplementation((url: string) => {
				if (typeof url === 'string' && url.includes('tinyfish')) {
					return Promise.resolve({ ok: false, status: 500, statusText: 'Error' });
				}
				return Promise.resolve(mockResponse);
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await webFetchTool.execute({
				url: 'https://example.com', extractMode: 'markdown', maxChars: 20000
			});

			expect(result.status).toBe('SUCCESS');
			expect(result.title).toBe('Test Page');
		});

		it('returns FETCH_REQUIRES_JS when extracted content is too short', async () => {
			const htmlContent = '<html><head><title>App</title></head><body><div id="root"></div></body></html>';
			const mockResponse = {
				ok: true,
				headers: {
					get: (name: string) => {
						if (name === 'content-type') return 'text/html';
						if (name === 'content-length') return String(htmlContent.length);
						return null;
					}
				},
				body: null,
				text: () => Promise.resolve(htmlContent)
			};

			const mockFetch = vi.fn().mockImplementation((url: string) => {
				if (typeof url === 'string' && url.includes('tinyfish')) {
					return Promise.resolve({ ok: false, status: 500, statusText: 'Error' });
				}
				return Promise.resolve(mockResponse);
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await webFetchTool.execute({
				url: 'https://spa-app.com', extractMode: 'markdown', maxChars: 20000
			});

			expect(result.status).toBe('FETCH_REQUIRES_JS');
			expect(result.error).toContain('JavaScript');
		});

		it('returns non-HTML content directly without transformation', async () => {
			const jsonContent = JSON.stringify({ data: 'hello', count: 42 });
			const mockResponse = {
				ok: true,
				headers: {
					get: (name: string) => {
						if (name === 'content-type') return 'application/json';
						if (name === 'content-length') return String(jsonContent.length);
						return null;
					}
				},
				body: null,
				text: () => Promise.resolve(jsonContent)
			};

			const mockFetch = vi.fn().mockImplementation((url: string) => {
				if (typeof url === 'string' && url.includes('tinyfish')) {
					return Promise.resolve({ ok: false, status: 500, statusText: 'Error' });
				}
				return Promise.resolve(mockResponse);
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await webFetchTool.execute({
				url: 'https://api.example.com/data', extractMode: 'markdown', maxChars: 20000
			});

			expect(result.status).toBe('SUCCESS');
			expect(result.content).toBe(jsonContent);
		});

		it('returns FETCH_FAILED for non-2xx HTTP responses', async () => {
			const mockFetch = vi.fn().mockImplementation((url: string) => {
				if (typeof url === 'string' && url.includes('tinyfish')) {
					return Promise.resolve({ ok: false, status: 500, statusText: 'Error' });
				}
				return Promise.resolve({
					ok: false,
					status: 404,
					statusText: 'Not Found',
					headers: { get: () => null }
				});
			});
			vi.stubGlobal('fetch', mockFetch);

			const result = await webFetchTool.execute({
				url: 'https://example.com/missing', extractMode: 'markdown', maxChars: 20000
			});

			expect(result.status).toBe('FETCH_FAILED');
			expect(result.error).toContain('404');
		});

		it('caches successful fetch results', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [
							{
								content: 'Fetched content',
								title: 'Page Title',
								url: 'https://example.com'
							}
						]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			await webFetchTool.execute({
				url: 'https://example.com', extractMode: 'markdown', maxChars: 20000
			});

			expect(fetchCache.has('https://example.com:markdown')).toBe(true);
		});

		it('uses different cache keys for different extract modes', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						results: [
							{
								content: 'Content',
								title: 'Title',
								url: 'https://example.com'
							}
						]
					})
			});
			vi.stubGlobal('fetch', mockFetch);

			await webFetchTool.execute({
				url: 'https://example.com', extractMode: 'markdown', maxChars: 20000
			});
			await webFetchTool.execute({
				url: 'https://example.com', extractMode: 'text', maxChars: 20000
			});

			expect(fetchCache.has('https://example.com:markdown')).toBe(true);
			expect(fetchCache.has('https://example.com:text')).toBe(true);
		});
	});
});
