import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	discoverProviderModels,
	withExponentialBackoff,
	DISCOVERY_ATTEMPTS,
	DISCOVERY_BACKOFF_BASE_MS,
	DISCOVERY_BACKOFF_MAX_MS
} from './discovery';
import type { UserCredential } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { encrypt as encryptText, getEncryptionKey } from './crypto';

const envKey = getEncryptionKey({});

function buildCustomCredential(baseUrl: string, apiKey?: string): UserCredential {
	const payload = JSON.stringify({
		displayName: 'custom',
		baseUrl,
		apiKey,
		models: [],
		headers: []
	});
	return {
		id: 'cred-1',
		userId: 1,
		providerId: 'custom-provider',
		credentialType: 'custom',
		encryptedData: encryptText(payload, envKey),
		priority: 1,
		enabled: 1,
		createdAt: '2025-01-01T00:00:00Z',
		updatedAt: '2025-01-01T00:00:00Z',
		discoveredModels: null,
		discoveredAt: null
	};
}

function makeCustomEnv(baseUrl: string, apiKey?: string): Record<string, string | undefined> {
	return {
		TOKEN_ENCRYPTION_KEY: envKey,
		CUSTOM_PROVIDER_BASE_URL: baseUrl,
		CUSTOM_PROVIDER_API_KEY: apiKey
	};
}

describe('discovery backoff', () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: false });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('retries the configured number of times and returns empty after all failures', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
		const env = makeCustomEnv('https://example.com');

		const promise = discoverProviderModels(buildCustomCredential('https://example.com'), env);

		// First attempt fires immediately.
		await vi.advanceTimersByTimeAsync(0);
		// Exhaust remaining backoff sleeps.
		await vi.runAllTimersAsync();

		const models = await promise;
		expect(models).toEqual([]);
		expect(fetchSpy).toHaveBeenCalledTimes(DISCOVERY_ATTEMPTS);
	});

	it('returns models on the final attempt without extra calls', async () => {
		const modelPayload = { data: [{ id: 'm1', name: 'Model One' }] };
		let calls = 0;
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			calls += 1;
			if (calls < DISCOVERY_ATTEMPTS) {
				return new Response('unavailable', { status: 503 });
			}
			return new Response(JSON.stringify(modelPayload), { status: 200 });
		});

		const env = makeCustomEnv('https://example.com');
		const promise = discoverProviderModels(buildCustomCredential('https://example.com'), env);

		await vi.runAllTimersAsync();
		const models = await promise;

		expect(fetchSpy).toHaveBeenCalledTimes(DISCOVERY_ATTEMPTS);
		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe('custom-provider/m1');
	});

	it('uses exponential backoff delays between attempts', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
		const delays: number[] = [];
		const originalSetTimeout = globalThis.setTimeout;
		vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number) => {
			if (typeof ms === 'number' && typeof handler === 'function') {
				delays.push(ms);
			}
			return originalSetTimeout(handler, ms ?? 0);
		}) as typeof setTimeout);

		const env = makeCustomEnv('https://example.com');
		const promise = discoverProviderModels(buildCustomCredential('https://example.com'), env);
		await vi.runAllTimersAsync();
		await promise;

		expect(fetchSpy).toHaveBeenCalledTimes(DISCOVERY_ATTEMPTS);
		// With 3 attempts there are 2 delays: base * 2^0 and base * 2^1, capped at max.
		expect(delays).toHaveLength(2);
		expect(delays[0]).toBe(DISCOVERY_BACKOFF_BASE_MS);
		expect(delays[1]).toBe(Math.min(DISCOVERY_BACKOFF_BASE_MS * 2, DISCOVERY_BACKOFF_MAX_MS));
	});

	it('withExponentialBackoff does not retry when shouldRetry returns false', async () => {
		const fn = vi.fn().mockRejectedValue(new Error('fatal'));
		await expect(
			withExponentialBackoff(fn, {
				attempts: 3,
				baseMs: 10,
				maxMs: 100,
				shouldRetry: (err) => err instanceof Error && err.message !== 'fatal'
			})
		).rejects.toThrow('fatal');
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
