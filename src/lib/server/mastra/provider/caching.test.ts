import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import {
	runWithCache,
	getCachedUserCredential,
	getCachedHiddenModelIdsForUser,
	getCachedPotluckConfig
} from './cache';
import * as credentials from './credentials';
import * as visibility from './visibility';
import * as potluck from './potluck';
import type { EncryptedCredential, PotluckConfig } from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { ModelId, ProviderId } from './types';

const fakeDb = {} as LibSQLDatabase<any>;
const env = {} as Record<string, string | undefined>;

const sampleCredential: EncryptedCredential = {
	id: 'cred-1',
	scope: 'user',
	credentialKind: 'personal',
	userId: 42,
	schoolId: null,
	providerId: 'groq',
	encryptedData: 'encrypted',
	priority: 1,
	enabled: 1,
	createdAt: '2025-01-01T00:00:00Z',
	updatedAt: '2025-01-01T00:00:00Z',
	discoveredModels: null,
	discoveredAt: null
};

const sampleConfig: PotluckConfig = {
	schoolId: 7,
	enabled: 1,
	donorRoles: '[]',
	consumerRoles: '[]',
	allowedProviders: '[]',
	perUserDailyTokenCap: 1000,
	perUserDailyRequestCap: 100,
	perProviderDailyTokenCap: null,
	auditRetentionDays: 90,
	tosVersion: '1.0',
	updatedBy: 1,
	updatedAt: '2025-01-01T00:00:00Z'
};

const sampleHidden = new Set<ModelId>(['groq/llama' as ModelId]);

describe('per-request caching layer', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('deduplicates user credential SELECTs inside a cache scope', async () => {
		const spy = vi.spyOn(credentials, 'getUserCredential').mockResolvedValue(sampleCredential);
		await runWithCache(async () => {
			const a = await getCachedUserCredential(fakeDb, env, 42, 'groq' as ProviderId);
			const b = await getCachedUserCredential(fakeDb, env, 42, 'groq' as ProviderId);
			expect(a).toBe(sampleCredential);
			expect(b).toBe(sampleCredential);
		});
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('bypasses the cache outside a cache scope', async () => {
		const spy = vi.spyOn(credentials, 'getUserCredential').mockResolvedValue(sampleCredential);
		const a = await getCachedUserCredential(fakeDb, env, 42, 'groq' as ProviderId);
		const b = await getCachedUserCredential(fakeDb, env, 42, 'groq' as ProviderId);
		expect(a).toBe(sampleCredential);
		expect(b).toBe(sampleCredential);
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('caches null credential results', async () => {
		const spy = vi.spyOn(credentials, 'getUserCredential').mockResolvedValue(null);
		await runWithCache(async () => {
			const a = await getCachedUserCredential(fakeDb, env, 99, 'groq' as ProviderId);
			const b = await getCachedUserCredential(fakeDb, env, 99, 'groq' as ProviderId);
			expect(a).toBeNull();
			expect(b).toBeNull();
		});
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('does not share cache across different keys', async () => {
		const spy = vi.spyOn(credentials, 'getUserCredential').mockImplementation(
			async (_db, _env, userId, providerId) => {
				return { ...sampleCredential, userId, providerId } as EncryptedCredential;
			}
		);
		await runWithCache(async () => {
			await getCachedUserCredential(fakeDb, env, 1, 'groq' as ProviderId);
			await getCachedUserCredential(fakeDb, env, 2, 'groq' as ProviderId);
			await getCachedUserCredential(fakeDb, env, 1, 'deepseek' as ProviderId);
		});
		expect(spy).toHaveBeenCalledTimes(3);
	});

	it('deduplicates potluck config SELECTs inside a cache scope', async () => {
		const spy = vi.spyOn(potluck, 'getPotluckConfig').mockResolvedValue(sampleConfig);
		await runWithCache(async () => {
			const a = await getCachedPotluckConfig(fakeDb, 7);
			const b = await getCachedPotluckConfig(fakeDb, 7);
			expect(a).toBe(sampleConfig);
			expect(b).toBe(sampleConfig);
		});
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('deduplicates hidden-model visibility SELECTs inside a cache scope', async () => {
		const spy = vi.spyOn(visibility, 'getHiddenModelIdsForUser').mockResolvedValue(sampleHidden);
		await runWithCache(async () => {
			const a = await getCachedHiddenModelIdsForUser(fakeDb, 42);
			const b = await getCachedHiddenModelIdsForUser(fakeDb, 42);
			expect(a).toBe(sampleHidden);
			expect(b).toBe(sampleHidden);
		});
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
