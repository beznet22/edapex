import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
	discoverProviderModels,
	persistDiscoveredModels,
	getDiscoveredModelsForUser,
	getAllDiscoveredModelsForUser,
	withExponentialBackoff,
	DISCOVERY_TIMEOUT_MS
} from './discovery';
import { encryptedCredentials, type EncryptedCredential } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { encrypt as encryptText, decrypt as decryptText, getEncryptionKey } from './crypto';
import type { ProviderId } from './types';
import type { ModelInfo } from '$lib/provider/spec';

const envKey = getEncryptionKey({});
const env = { TOKEN_ENCRYPTION_KEY: envKey };

async function cleanupUser(userId: number): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, userId)));
}

function buildCustomCredential(overrides: Partial<EncryptedCredential> = {}): EncryptedCredential {
	const baseUrl = 'https://custom.example.com';
	const payload = JSON.stringify({
		displayName: 'custom',
		baseUrl,
		apiKey: 'api-key',
		models: [],
		headers: []
	});
	return {
		id: 'cred-1',
		scope: 'user',
		credentialKind: 'custom',
		userId: 1,
		schoolId: null,
		providerId: 'custom-provider',
		encryptedData: encryptText(payload, envKey),
		priority: 1,
		enabled: 1,
		createdAt: '2025-01-01T00:00:00Z',
		updatedAt: '2025-01-01T00:00:00Z',
		discoveredModels: null,
		discoveredAt: null,
		...overrides
	};
}

describe('discoverProviderModels', () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: false });
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('skips discovery for opengateway provider', async () => {
		const models = await discoverProviderModels(
			buildCustomCredential({ providerId: 'opengateway' as ProviderId }),
			env
		);
		expect(models).toEqual([]);
	});

	it('skips discovery for nvidia provider', async () => {
		const models = await discoverProviderModels(
			buildCustomCredential({ providerId: 'nvidia' as ProviderId }),
			env
		);
		expect(models).toEqual([]);
	});

	it('skips discovery for mistral provider', async () => {
		const models = await discoverProviderModels(
			buildCustomCredential({ providerId: 'mistral' as ProviderId }),
			env
		);
		expect(models).toEqual([]);
	});

	it('skips discovery for personal credential', async () => {
		const models = await discoverProviderModels(
			buildCustomCredential({ credentialKind: 'personal' }),
			env
		);
		expect(models).toEqual([]);
	});

	it('returns empty array when encrypted data is missing', async () => {
		const models = await discoverProviderModels(
			buildCustomCredential({ encryptedData: '' }),
			env
		);
		expect(models).toEqual([]);
	});

	it('returns empty array when decrypted payload has no baseUrl', async () => {
		const payload = JSON.stringify({ displayName: 'x', baseUrl: '', apiKey: 'k', models: [], headers: [] });
		const models = await discoverProviderModels(
			buildCustomCredential({ encryptedData: encryptText(payload, envKey) }),
			env
		);
		expect(models).toEqual([]);
	});

	it('discovers and builds models from /models response', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					data: [
						{
							id: 'm1',
							name: 'Model One',
							context_length: 128000,
							supported_parameters: ['tools'],
							capabilities: { function_calling: true },
							architecture: { input_modalities: ['text'], output_modalities: ['text'] },
							top_provider: { max_completion_tokens: 8192 },
							pricing: { prompt: '0.00001', completion: '0.00002' }
						}
					]
				}),
				{ status: 200 }
			)
		);

		const models = await discoverProviderModels(buildCustomCredential(), env);
		await vi.runAllTimersAsync();

		expect(fetchSpy).toHaveBeenCalledWith(
			'https://custom.example.com/models',
			expect.objectContaining({
				method: 'GET',
				headers: expect.objectContaining({ Accept: 'application/json', Authorization: 'Bearer api-key' }),
				signal: expect.any(AbortSignal)
			})
		);

		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe('custom-provider/m1');
		expect(models[0]?.capabilities.tools).toBe(true);
		expect(models[0]?.capabilities.vision).toBe(false);
	});

	it('strips trailing slashes from baseUrl', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ data: [] }), { status: 200 })
		);
		const payload = JSON.stringify({
			displayName: 'x',
			baseUrl: 'https://custom.example.com///',
			apiKey: 'k',
			models: [],
			headers: []
		});
		await discoverProviderModels(
			buildCustomCredential({ encryptedData: encryptText(payload, envKey) }),
			env
		);
		expect(fetchSpy).toHaveBeenCalledWith('https://custom.example.com/models', expect.any(Object));
	});

	it('returns empty array when fetch fails after retries', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
		const promise = discoverProviderModels(buildCustomCredential(), env);
		await vi.runAllTimersAsync();
		const models = await promise;
		expect(models).toEqual([]);
	});

	it('returns empty array on non-ok HTTP response', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error', { status: 500 }));
		const promise = discoverProviderModels(buildCustomCredential(), env);
		await vi.runAllTimersAsync();
		const models = await promise;
		expect(models).toEqual([]);
	});

	it('returns empty array on malformed JSON response', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 200 }));
		const promise = discoverProviderModels(buildCustomCredential(), env);
		await vi.runAllTimersAsync();
		const models = await promise;
		expect(models).toEqual([]);
	});

	it('builds model with reasoning and vision capabilities', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					data: [
						{
							id: 'm2',
							name: 'Model Two',
							context_length: 8192,
							supported_parameters: ['reasoning', 'reasoningEffort'],
							architecture: { input_modalities: ['image', 'file'], output_modalities: ['text'] },
							pricing: { prompt: '0', completion: '0' }
						}
					]
				}),
				{ status: 200 }
			)
		);
		const promise = discoverProviderModels(buildCustomCredential(), env);
		await vi.runAllTimersAsync();
		const models = await promise;
		expect(models).toHaveLength(1);
		expect(models[0]?.capabilities.reasoning).toBe(true);
		expect(models[0]?.capabilities.vision).toBe(true);
		expect(models[0]?.capabilities.input).toEqual(expect.arrayContaining(['image/*', 'application/*']));
		expect(models[0]?.capabilities.output).toBeDefined();
		expect(models[0]?.cost).toBeDefined();
	});

	it('omits invalid models that fail ModelInfoSchema', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					data: [{ id: 'valid', name: 'Valid' }, { id: '', name: 'No Id' }]
				}),
				{ status: 200 }
			)
		);
		const models = await discoverProviderModels(buildCustomCredential(), env);
		await vi.runAllTimersAsync();
		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe('custom-provider/valid');
	});
});

describe('persistDiscoveredModels', () => {
	beforeEach(async () => {
		await cleanupUser(1);
	});

	afterEach(async () => {
		await cleanupUser(1);
	});

	it('encrypts and persists discovered models', async () => {
		await getAppDb().insert(encryptedCredentials).values({
			scope: 'user',
			credentialKind: 'custom',
			userId: 1,
			schoolId: null,
			providerId: 'custom-provider',
			encryptedData: encryptText(
				JSON.stringify({ displayName: 'x', baseUrl: 'https://x.com', models: [], headers: [] }),
				envKey
			),
			enabled: 1
		});

		const models: ModelInfo[] = [
			{
				id: 'custom-provider/m1' as ProviderId,
				providerId: 'custom-provider' as ProviderId,
				name: 'Model One',
				capabilities: {
					tools: false,
					input: [],
					output: [],
					reasoning: false,
					vision: false,
					thinkingEffort: false
				},
				request: { headers: {}, body: {}, generation: {}, options: {} },
				variants: [],
				status: 'active',
				enabled: true,
				limit: { context: 8192, output: 4096 },
				tier: 'mid',
				description: ''
			}
		];

		await persistDiscoveredModels(getAppDb(), env, 1, 'custom-provider' as ProviderId, models);

		const rows = await getAppDb()
			.select({ discoveredModels: encryptedCredentials.discoveredModels })
			.from(encryptedCredentials)
			.where(
				and(
					eq(encryptedCredentials.scope, 'user'),
					eq(encryptedCredentials.userId, 1),
					eq(encryptedCredentials.providerId, 'custom-provider')
				)
			);
		const encrypted = rows[0]?.discoveredModels;
		expect(encrypted).toBeTruthy();
		const decrypted = JSON.parse(decryptText(encrypted!, envKey));
		expect(decrypted).toHaveLength(1);
		expect(decrypted[0].id).toBe('custom-provider/m1');
	});
});

describe('getDiscoveredModelsForUser', () => {
	beforeEach(async () => {
		await cleanupUser(1);
	});

	afterEach(async () => {
		await cleanupUser(1);
	});

	it('returns empty array when no discovered models exist', async () => {
		const models = await getDiscoveredModelsForUser(
			getAppDb(),
			env,
			1,
			'custom-provider' as ProviderId
		);
		expect(models).toEqual([]);
	});

	it('returns decrypted discovered models', async () => {
		const models: ModelInfo[] = [
			{
				id: 'custom-provider/m1' as ProviderId,
				providerId: 'custom-provider' as ProviderId,
				name: 'Model One',
				capabilities: {
					tools: false,
					input: [],
					output: [],
					reasoning: false,
					vision: false,
					thinkingEffort: false
				},
				request: { headers: {}, body: {}, generation: {}, options: {} },
				variants: [],
				status: 'active',
				enabled: true,
				limit: { context: 8192, output: 4096 },
				tier: 'mid',
				description: ''
			}
		];
		await getAppDb().insert(encryptedCredentials).values({
			scope: 'user',
			credentialKind: 'custom',
			userId: 1,
			schoolId: null,
			providerId: 'custom-provider',
			encryptedData: encryptText(
				JSON.stringify({ displayName: 'x', baseUrl: 'https://x.com', models: [], headers: [] }),
				envKey
			),
			discoveredModels: encryptText(JSON.stringify(models), envKey),
			enabled: 1
		});

		const result = await getDiscoveredModelsForUser(
			getAppDb(),
			env,
			1,
			'custom-provider' as ProviderId
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe('custom-provider/m1');
	});

	it('returns empty array when decryption fails', async () => {
		await getAppDb().insert(encryptedCredentials).values({
			scope: 'user',
			credentialKind: 'custom',
			userId: 1,
			schoolId: null,
			providerId: 'custom-provider',
			encryptedData: encryptText(
				JSON.stringify({ displayName: 'x', baseUrl: 'https://x.com', models: [], headers: [] }),
				envKey
			),
			discoveredModels: 'invalid-ciphertext',
			enabled: 1
		});

		const result = await getDiscoveredModelsForUser(
			getAppDb(),
			env,
			1,
			'custom-provider' as ProviderId
		);
		expect(result).toEqual([]);
	});

	it('returns empty array when parsed JSON is invalid', async () => {
		await getAppDb().insert(encryptedCredentials).values({
			scope: 'user',
			credentialKind: 'custom',
			userId: 1,
			schoolId: null,
			providerId: 'custom-provider',
			encryptedData: encryptText(
				JSON.stringify({ displayName: 'x', baseUrl: 'https://x.com', models: [], headers: [] }),
				envKey
			),
			discoveredModels: encryptText('not-json', envKey),
			enabled: 1
		});

		const result = await getDiscoveredModelsForUser(
			getAppDb(),
			env,
			1,
			'custom-provider' as ProviderId
		);
		expect(result).toEqual([]);
	});
});

describe('getAllDiscoveredModelsForUser', () => {
	beforeEach(async () => {
		await cleanupUser(1);
		vi.resetModules();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await cleanupUser(1);
	});

	it('aggregates discovered models across credentials', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { TOKEN_ENCRYPTION_KEY: envKey }
		}));

		const models: ModelInfo[] = [
			{
				id: 'provider-a/m1' as ProviderId,
				providerId: 'provider-a' as ProviderId,
				name: 'Model A',
				capabilities: {
					tools: false,
					input: [],
					output: [],
					reasoning: false,
					vision: false,
					thinkingEffort: false
				},
				request: { headers: {}, body: {}, generation: {}, options: {} },
				variants: [],
				status: 'active',
				enabled: true,
				limit: { context: 8192, output: 4096 },
				tier: 'mid',
				description: ''
			}
		];

		await getAppDb().insert(encryptedCredentials).values({
			scope: 'user',
			credentialKind: 'custom',
			userId: 1,
			schoolId: null,
			providerId: 'provider-a',
			encryptedData: encryptText(
				JSON.stringify({ displayName: 'x', baseUrl: 'https://a.com', models: [], headers: [] }),
				envKey
			),
			discoveredModels: encryptText(JSON.stringify(models), envKey),
			enabled: 1
		});

		const { getAllDiscoveredModelsForUser: fn } = await import('./discovery');
		const map = await fn(getAppDb(), 1);
		expect(map.size).toBe(1);
		expect(map.get('provider-a/m1' as ProviderId)?.name).toBe('Model A');
	});
});

describe('withExponentialBackoff', () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: false });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('returns immediately on success', async () => {
		const fn = vi.fn().mockResolvedValue('ok');
		const result = withExponentialBackoff(fn, { attempts: 3, baseMs: 10, maxMs: 100 });
		await vi.runAllTimersAsync();
		expect(await result).toBe('ok');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('retries until success and respects shouldRetry', async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error('retryable'))
			.mockResolvedValue('ok');
		const result = withExponentialBackoff(fn, {
			attempts: 3,
			baseMs: 10,
			maxMs: 100,
			shouldRetry: (err) => err instanceof Error && err.message === 'retryable'
		});
		await vi.runAllTimersAsync();
		expect(await result).toBe('ok');
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('throws the last error when all attempts are exhausted', async () => {
		const fn = vi.fn().mockRejectedValue(new Error('always fails'));
		const result = withExponentialBackoff(fn, { attempts: 3, baseMs: 10, maxMs: 100 });
		result.catch(() => {});
		await vi.runAllTimersAsync();
		await expect(result).rejects.toThrow('always fails');
		expect(fn).toHaveBeenCalledTimes(3);
	});
});
