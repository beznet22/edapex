import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import {
	resolveModelForRequest,
	pickDefaultModelId,
	buildModel,
	pickDefaultVariantId,
	type ResolvedRequestModel
} from './resolver';
import * as tierRouter from './tier-router';
import * as rateLimit from './rate-limit';
import {
	ModelNotFoundError,
	ProviderNotFoundError,
	NoProvidersError,
	ProviderDisabledError,
	NoCredentialError
} from './errors';
import type { ProviderId, ModelId } from './types';
import {
	BUILTIN_PROVIDERS,
	BUILTIN_MODELS,
	DEFAULT_MODEL_ID,
	THINKING_VARIANTS
} from '$lib/provider/catalog';
import { encrypt } from './crypto';
import * as auditLog from '$lib/server/audit-log';

vi.mock('./tier-router', async (importOriginal) => {
	const mod = await importOriginal<typeof import('./tier-router')>();
	return {
		...mod,
		resolveProviderKeyWithTrace: vi.fn()
	};
});

vi.mock('./rate-limit', () => ({
	createRateLimitFetch: vi.fn().mockResolvedValue(fetch)
}));

vi.mock('$lib/server/audit-log', () => ({
	log: vi.fn().mockResolvedValue(undefined)
}));

function createInMemoryDb(): { db: LibSQLDatabase<any>; client: Client } {
	const client = createClient({ url: ':memory:' });
	const db = drizzle(client);
	return { db, client };
}

describe('resolveModelForRequest edge cases', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const pair = createInMemoryDb();
		db = pair.db;
		client = pair.client;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockReset();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await client.close();
	});

	it('throws NoProvidersError for empty input', async () => {
		await expect(resolveModelForRequest(42, '', db)).rejects.toBeInstanceOf(NoProvidersError);
	});

	it('throws ModelNotFoundError when model id has no provider segment', async () => {
		await expect(resolveModelForRequest(42, 'no-slash-model', db)).rejects.toBeInstanceOf(
			ModelNotFoundError
		);
	});

	it('throws ProviderNotFoundError for an unknown provider id', async () => {
		await expect(resolveModelForRequest(42, 'unknown/model', db)).rejects.toBeInstanceOf(
			ProviderNotFoundError
		);
	});

	it('throws ModelNotFoundError when provider prefix is missing from model id', async () => {
		const knownProvider = Object.keys(BUILTIN_PROVIDERS)[0] as ProviderId;
		await expect(
			resolveModelForRequest(42, `${knownProvider}/`, db)
		).rejects.toBeInstanceOf(ModelNotFoundError);
	});

	it('throws ModelNotFoundError for an unknown model under a known provider', async () => {
		const knownProvider = Object.keys(BUILTIN_PROVIDERS)[0] as ProviderId;
		await expect(
			resolveModelForRequest(42, `${knownProvider}/totally-fake-model-xyz`, db)
		).rejects.toBeInstanceOf(ModelNotFoundError);
	});

	it('throws ProviderDisabledError when credential is explicitly disabled', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey: 'x',
			source: 'user',
			tier: 1,
			credentialEnabled: false,
			trace: []
		});

		await expect(
			resolveModelForRequest(42, `${defaultModel}`, db)
		).rejects.toBeInstanceOf(ProviderDisabledError);
	});

	it('resolves with env key source mapped to tier 3', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		const apiKey = 'env-api-key';
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey,
			source: 'env',
			tier: 3,
			credentialEnabled: null,
			trace: []
		});

		const resolved = await resolveModelForRequest(42, `${defaultModel}`, db);
		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
		expect(resolved.config).toMatchObject({ apiKey });
	});

	it('resolves with pool key source mapped to tier 2', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		const apiKey = 'donated-key';
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey,
			source: 'pool',
			tier: 2,
			credentialEnabled: null,
			trace: []
		});

		const resolved = await resolveModelForRequest(42, `${defaultModel}`, db);
		expect(resolved.keySource).toBe('pool');
		expect(resolved.tier).toBe(2);
	});

	it('passes the school id and user role from the trace context to the tier router', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey: 'x',
			source: 'env',
			tier: 3,
			credentialEnabled: null,
			trace: []
		});

		await resolveModelForRequest(
			42,
			`${defaultModel}`,
			db,
			{ actorStaffId: 5, schoolId: 7 },
			{ userId: 42, schoolId: 7, actorStaffId: 5, userRole: 'student' }
		);

		expect(tierRouter.resolveProviderKeyWithTrace).toHaveBeenCalledWith(
			expect.objectContaining({
				schoolId: 7,
				userRole: 'student',
				auditStaffId: 5,
				auditActor: 5
			})
		);
	});

	it('does not apply variant options when no variant is requested', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey: 'x',
			source: 'env',
			tier: 3,
			credentialEnabled: null,
			trace: []
		});

		const resolved = await resolveModelForRequest(42, `${defaultModel}`, db);
		expect(resolved.variantId).toBeNull();
		expect(resolved.providerOptions).toBeUndefined();
	});

	it('returns variant options for a known variant suffix', async () => {
		const modelInfo = Object.values(BUILTIN_MODELS).find((m) => m.variants.length > 0);
		if (!modelInfo) {
			// All built-ins have variants today; skip only if that changes.
			return;
		}
		const variantId = modelInfo.variants[0]!.id;
		const input = `${modelInfo.id}@${variantId}`;

		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey: 'x',
			source: 'env',
			tier: 3,
			credentialEnabled: null,
			trace: []
		});

		const resolved = await resolveModelForRequest(42, input, db);
		expect(resolved.variantId).toBe(variantId);
		expect(resolved.providerOptions).toEqual({
			[modelInfo.providerId]: modelInfo.variants[0]!.options ?? {}
		});
	});

	it('writes an audit log entry when audit context is provided', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey: 'x',
			source: 'env',
			tier: 3,
			credentialEnabled: null,
			trace: []
		});

		await resolveModelForRequest(42, `${defaultModel}`, db, {
			actorStaffId: 5,
			schoolId: 7
		});

		expect(auditLog.log).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'access',
				entityType: 'providerKey',
				schoolId: 7,
				actorStaffId: 5
			})
		);
	});

	it('writes a structured providerResolution trace when resolveContext is provided', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey: 'x',
			source: 'env',
			tier: 3,
			credentialEnabled: null,
			trace: []
		});

		await resolveModelForRequest(
			42,
			`${defaultModel}`,
			db,
			{ actorStaffId: 5, schoolId: 7 },
			{ userId: 42, schoolId: 7, actorStaffId: 5, userRole: 'student' }
		);

		const calls = vi.mocked(auditLog.log).mock.calls;
		const resolution = calls.find((c) => c[0].entityType === 'providerResolution');
		expect(resolution).toBeDefined();
		expect(resolution![0].after).toMatchObject({
			provider: 'groq',
			model: defaultModel,
			tier: 3,
			keySource: 'env',
			outcome: 'success'
		});
	});

	it('converts AllTiersFailedError to NoCredentialError', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockRejectedValue(
			new tierRouter.AllTiersFailedError('groq' as ProviderId, [])
		);

		await expect(
			resolveModelForRequest(42, `${defaultModel}`, db)
		).rejects.toBeInstanceOf(NoCredentialError);
	});

	it('ignores an unknown variant suffix and leaves providerOptions undefined', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey: 'x',
			source: 'env',
			tier: 3,
			credentialEnabled: null,
			trace: []
		});

		const resolved = await resolveModelForRequest(42, `${defaultModel}@nonexistent`, db);
		expect(resolved.variantId).toBe('nonexistent');
		expect(resolved.providerOptions).toBeUndefined();
	});

	it('preserves nested model names after the provider prefix', async () => {
		const input = 'groq/qwen/qwen3-32b';
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey: 'x',
			source: 'env',
			tier: 3,
			credentialEnabled: null,
			trace: []
		});

		const resolved = await resolveModelForRequest(42, input, db);
		expect(resolved.providerId).toBe('groq');
		expect(resolved.modelName).toBe('qwen/qwen3-32b');
		expect(resolved.config).toMatchObject({ id: 'groq/qwen/qwen3-32b' });
	});
});

describe('pickDefaultModelId edge cases', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const pair = createInMemoryDb();
		db = pair.db;
		client = pair.client;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockReset();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await client.close();
	});

	it('returns null when no credential tier can serve any model', async () => {
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockRejectedValue(
			new tierRouter.AllTiersFailedError('groq' as ProviderId, [])
		);
		const result = await pickDefaultModelId(db, {}, { userId: 42, schoolId: null, userRole: null });
		expect(result).toBeNull();
	});

	it('returns default model id when its provider is connected', async () => {
		const defaultModel = DEFAULT_MODEL_ID;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockResolvedValue({
			apiKey: 'x',
			source: 'env',
			tier: 3,
			credentialEnabled: null,
			trace: []
		});

		const result = await pickDefaultModelId(db, {}, { userId: 42, schoolId: null, userRole: null });
		expect(result).not.toBeNull();
		expect(result).toContain(defaultModel);
	});

	it('falls back to the first chat-routable model with a connected credential', async () => {
		const defaultModelProvider = BUILTIN_MODELS[DEFAULT_MODEL_ID]!.providerId;
		let calls = 0;
		vi.mocked(tierRouter.resolveProviderKeyWithTrace).mockImplementation(async (args) => {
			calls += 1;
			if (args.providerId === defaultModelProvider) {
				throw new tierRouter.AllTiersFailedError(args.providerId, []);
			}
			return {
				apiKey: 'x',
				source: 'env',
				tier: 3,
				credentialEnabled: null,
				trace: []
			};
		});

		const result = await pickDefaultModelId(db, {}, { userId: 42, schoolId: null, userRole: null });
		expect(result).not.toBeNull();
		expect(calls).toBeGreaterThan(1);
	});
});

describe('buildModel edge cases', () => {
	it('builds openai-compatible config for aisdk providers', () => {
		const provider = BUILTIN_PROVIDERS['groq'];
		const config = buildModel('groq', provider, 'llama-3.3-70b-versatile', 'api-key', fetch);
		expect(config).toMatchObject({
			id: 'groq/llama-3.3-70b-versatile',
			url: provider.api.url,
			apiKey: 'api-key',
			fetch
		});
	});

	it('falls back to openai-compatible config for native api type', () => {
		const provider = {
			...BUILTIN_PROVIDERS['groq'],
			api: { type: 'native' as const, url: 'https://native.example.com/v1', settings: {} }
		};
		const config = buildModel('groq', provider, 'native-model', 'native-key', fetch);
		expect(config).toMatchObject({
			id: 'groq/native-model',
			url: 'https://native.example.com/v1',
			apiKey: 'native-key',
			fetch
		});
	});

	it('layers model-level headers over provider-level headers', () => {
		const provider = {
			...BUILTIN_PROVIDERS['groq'],
			request: { headers: { 'X-Provider': 'groq' }, body: {} }
		};
		const modelInfo = {
			request: { headers: { 'X-Model': 'llama' }, body: {}, generation: {}, options: {} }
		};
		const config = buildModel(
			'groq',
			provider,
			'llama-3.3-70b-versatile',
			'api-key',
			fetch,
			modelInfo as any
		);
		expect(config).toMatchObject({
			headers: {
				'X-Provider': 'groq',
				'X-Model': 'llama'
			}
		});
	});
});

describe('pickDefaultVariantId edge cases', () => {
	it('selects low variant when available', () => {
		const model = { variants: [{ id: 'thinking' }, { id: 'low' }, { id: 'auto' }] };
		const result = pickDefaultVariantId(model);
		expect(result).toBe('low');
	});

	it('falls back to the first variant when low is absent', () => {
		const model = { variants: [{ id: 'fast' }, { id: 'auto' }] };
		const result = pickDefaultVariantId(model);
		expect(result).toBe('fast');
	});

	it('falls back to the first variant for the shared THINKING_VARIANTS list', () => {
		const model = { variants: THINKING_VARIANTS };
		const result = pickDefaultVariantId(model);
		expect(result).toBe('thinking');
	});

	it('returns null when the model has no variants', () => {
		const model = { variants: [] as Array<{ id: string }> };
		const result = pickDefaultVariantId(model);
		expect(result).toBeNull();
	});
});
