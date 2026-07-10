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

	it('uses env override for kimchi version', async () => {
		const headers = await resolveDynamicHeaders('kimchi', { KIMCHI_VERSION: '1.2.3' });
		expect(headers).toEqual({ 'User-Agent': 'kimchi/1.2.3' });
	});

	it('falls back to 0.0.0 / dev when fetch fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({ 'User-Agent': 'kimchi/dev' });
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
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({ 'User-Agent': 'kimchi/0.5.0' });
		expect(fetch).toHaveBeenCalledWith(
			'https://raw.githubusercontent.com/getkimchi/kimchi/master/package.json'
		);
		vi.unstubAllGlobals();
	});

	it('falls back to dev when GitHub returns non-ok', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({ 'User-Agent': 'kimchi/dev' });
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
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({ 'User-Agent': 'kimchi/dev' });
		vi.unstubAllGlobals();
	});

	it('uses cached version within TTL', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({ version: 'cached-version' })
		});
		vi.stubGlobal('fetch', fetchMock);

		const now = Date.now();
		vi.setSystemTime(now);

		// First call fetches and primes cache.
		await resolveDynamicHeaders('kimchi', {});
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Second call within TTL reuses cache and does not fetch again.
		const headers = await resolveDynamicHeaders('kimchi', {});
		expect(headers).toEqual({ 'User-Agent': 'kimchi/cached-version' });
		expect(fetchMock).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
});
