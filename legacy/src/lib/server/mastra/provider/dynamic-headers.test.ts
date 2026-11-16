import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveDynamicHeaders, resetKimchiVersionCache } from './dynamic-headers';

describe('resolveDynamicHeaders', () => {
	beforeEach(() => {
		resetKimchiVersionCache();
		vi.unstubAllGlobals();
	});

	it('returns empty object for unregistered provider', async () => {
		const headers = await resolveDynamicHeaders('groq' as import('./types').ProviderId, {});
		expect(headers).toEqual({});
	});

	it('uses env override for kimchi version and adds session headers', async () => {
		vi.stubGlobal('crypto', { randomUUID: () => 'test-session-id' });
		const headers = await resolveDynamicHeaders('kimchi', { KIMCHI_VERSION: '1.2.3' });
		expect(headers).toEqual({
			'User-Agent': 'kimchi/1.2.3',
			'X-Session-Id': 'test-session-id',
			'X-Turn-Index': '0'
		});
	});

	it('falls back to dev and adds session headers when fetch fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		vi.stubGlobal('crypto', { randomUUID: () => 'fallback-session-id' });
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({
			'User-Agent': 'kimchi/dev',
			'X-Session-Id': 'fallback-session-id',
			'X-Turn-Index': '0'
		});
		vi.unstubAllGlobals();
	});

	it('fetches version from GitHub when no override or cache', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ version: '0.5.0' })
			})
		);
		vi.stubGlobal('crypto', { randomUUID: () => 'github-session-id' });
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({
			'User-Agent': 'kimchi/0.5.0',
			'X-Session-Id': 'github-session-id',
			'X-Turn-Index': '0'
		});
		expect(fetch).toHaveBeenCalledWith(
			'https://raw.githubusercontent.com/getkimchi/kimchi/master/package.json',
			expect.anything()
		);
		vi.unstubAllGlobals();
	});

	it('falls back to dev when GitHub returns non-ok', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		vi.stubGlobal('crypto', { randomUUID: () => 'non-ok-session-id' });
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({
			'User-Agent': 'kimchi/dev',
			'X-Session-Id': 'non-ok-session-id',
			'X-Turn-Index': '0'
		});
		vi.unstubAllGlobals();
	});

	it('falls back to dev when GitHub returns invalid version', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ version: 123 })
			})
		);
		vi.stubGlobal('crypto', { randomUUID: () => 'invalid-session-id' });
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({
			'User-Agent': 'kimchi/dev',
			'X-Session-Id': 'invalid-session-id',
			'X-Turn-Index': '0'
		});
		vi.unstubAllGlobals();
	});

	it('uses cached version within TTL', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({ version: 'cached-version' })
		});
		vi.stubGlobal('fetch', fetchMock);
		vi.stubGlobal('crypto', { randomUUID: () => 'cached-session-id' });

		const now = Date.now();
		vi.setSystemTime(now);

		// First call fetches and primes cache.
		await resolveDynamicHeaders('kimchi', {});
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Second call within TTL reuses cache and does not fetch again.
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({
			'User-Agent': 'kimchi/cached-version',
			'X-Session-Id': 'cached-session-id',
			'X-Turn-Index': '0'
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
});
