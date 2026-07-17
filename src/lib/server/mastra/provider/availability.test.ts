import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { encryptedCredentials } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { getAvailableModelsForUser } from './availability';
import { saveUserCredential } from './credentials';
import * as discovery from './discovery';
import * as cache from './cache';
import { setModelVisibility } from './visibility';
import * as adminOverrides from './admin-model-overrides';

const ENCRYPTION_KEY = 'edapex-default-encryption-key-32ch';
const USER_ID = 98300;
const SCHOOL_ID = 98300;

vi.mock('./discovery', () => ({
	getDiscoveredModelsForUser: vi.fn(),
	getAllDiscoveredModelsForUser: vi.fn(),
	getCachedPlatformProviderModels: vi.fn(),
	discoverProviderModels: vi.fn(),
	persistDiscoveredModels: vi.fn(async () => {})
}));

vi.mock('./admin-model-overrides', () => ({
	listAdminOverrides: vi.fn(),
	applyAdminDenylist: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({
	env: process.env
}));

async function cleanup(): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, USER_ID)));
}

async function seedCredential(providerId: string, enabled = true): Promise<void> {
	const db = getAppDb();
	await saveUserCredential(
		db,
		{ TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY },
		{
			userId: USER_ID,
			providerId: providerId as import('./types').ProviderId,
			credentialType: 'credential',
			apiKey: `key-${providerId}`,
			enabled
		}
	);
}

describe('getAvailableModelsForUser', () => {
	beforeEach(async () => {
		await cleanup();
		vi.mocked(discovery.getDiscoveredModelsForUser).mockReset();
		vi.mocked(discovery.getAllDiscoveredModelsForUser).mockReset();
		vi.mocked(discovery.getAllDiscoveredModelsForUser).mockResolvedValue(new Map());
		vi.mocked(discovery.getCachedPlatformProviderModels).mockReset();
		vi.mocked(discovery.getCachedPlatformProviderModels).mockResolvedValue([]);
		vi.mocked(adminOverrides.listAdminOverrides).mockReset();
		vi.mocked(adminOverrides.applyAdminDenylist).mockReset();
	});

	afterEach(cleanup);

	it('returns platform models when no user credentials exist', async () => {
		const db = getAppDb();
		vi.mocked(adminOverrides.listAdminOverrides).mockResolvedValue([]);
		vi.mocked(adminOverrides.applyAdminDenylist).mockImplementation(
			(entries) => entries as { providerId: string; modelId: string }[]
		);

		const models = await getAvailableModelsForUser(
			db,
			{ GROQ_API_KEY: 'platform-groq' },
			USER_ID,
			SCHOOL_ID
		);
		expect(models.every((m) => m.source === 'platform')).toBe(true);
		expect(models.some((m) => m.providerId === 'groq')).toBe(true);
	});

	it('returns user-sourced catalog models for credentialed provider', async () => {
		const db = getAppDb();
		await seedCredential('groq');
		vi.mocked(adminOverrides.listAdminOverrides).mockResolvedValue([]);
		vi.mocked(adminOverrides.applyAdminDenylist).mockImplementation(
			(entries) => entries as { providerId: string; modelId: string }[]
		);

		const models = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL_ID);
		expect(models.some((m) => m.providerId === 'groq' && m.source === 'user')).toBe(true);
	});

	it('returns catalog models for credentialed provider even when discovery empty', async () => {
		const db = getAppDb();
		await seedCredential('groq');
		vi.mocked(adminOverrides.listAdminOverrides).mockResolvedValue([]);
		vi.mocked(adminOverrides.applyAdminDenylist).mockImplementation(
			(entries) => entries as { providerId: string; modelId: string }[]
		);

		const models = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL_ID);
		expect(models.length).toBeGreaterThan(0);
		expect(models.every((m) => m.source === 'user')).toBe(true);
	});

	it('skips disabled credentials', async () => {
		const db = getAppDb();
		await seedCredential('groq', false);
		vi.mocked(adminOverrides.listAdminOverrides).mockResolvedValue([]);
		vi.mocked(adminOverrides.applyAdminDenylist).mockImplementation(
			(entries) => entries as { providerId: string; modelId: string }[]
		);

		const models = await getAvailableModelsForUser(
			db,
			{ GROQ_API_KEY: 'platform-groq' },
			USER_ID,
			SCHOOL_ID
		);
		expect(models.every((m) => m.source === 'platform')).toBe(true);
	});

	it('filters hidden models', async () => {
		const db = getAppDb();
		await seedCredential('groq');
		vi.mocked(discovery.getDiscoveredModelsForUser).mockResolvedValue([]);
		vi.mocked(adminOverrides.listAdminOverrides).mockResolvedValue([]);
		vi.mocked(adminOverrides.applyAdminDenylist).mockImplementation(
			(entries) => entries as { providerId: string; modelId: string }[]
		);

		await setModelVisibility(db, USER_ID, 'llama-3-8b', false);

		const models = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL_ID);
		expect(models.some((m) => m.id === 'llama-3-8b')).toBe(false);

		await cleanup();
	});

	it('platform-sourced models respect admin denylist', async () => {
		const db = getAppDb();
		vi.mocked(adminOverrides.listAdminOverrides).mockResolvedValue([]);
		vi.mocked(adminOverrides.applyAdminDenylist).mockImplementation(() => []);

		const models = await getAvailableModelsForUser(
			db,
			{ GROQ_API_KEY: 'platform-groq' },
			USER_ID,
			SCHOOL_ID
		);
		expect(models).toHaveLength(0);
	});

	it('user-scoped credentials bypass provider-level admin denylist', async () => {
		// Regression: the comment at the top of availability.ts promises that
		// "the user has connected their own key, which overrides the platform
		// decision." Provider-level admin denials (modelId=null) must NOT
		// block user-scoped models in Pass 1. They still apply to Pass 3
		// (platform env-backed providers).
		const db = getAppDb();
		await seedCredential('groq');
		// Admin disabled groq at the provider level.
		vi.mocked(adminOverrides.listAdminOverrides).mockResolvedValue([
			{ providerId: 'groq', modelId: null, schoolId: SCHOOL_ID, reason: 'test' } as any
		]);
		vi.mocked(adminOverrides.applyAdminDenylist).mockImplementation(
			(entries) => entries as { providerId: string; modelId: string }[]
		);
		vi.mocked(discovery.getAllDiscoveredModelsForUser).mockResolvedValue(new Map());
		vi.mocked(discovery.getCachedPlatformProviderModels).mockResolvedValue([]);

		const models = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL_ID);
		// User-scoped groq catalog models still appear, with source='user'
		// (not 'platform'), even though the provider is admin-disabled.
		const groqModels = models.filter((m) => m.providerId === 'groq');
		expect(groqModels.length).toBeGreaterThan(0);
		expect(groqModels.every((m) => m.source === 'user')).toBe(true);
	});
});
