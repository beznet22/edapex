import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import {
	encryptedCredentials,
	providerAccessPolicy,
	potluckConfig
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import { resolveModelForRequest, pickDefaultModelId } from './resolver';
import { saveUserCredential } from './credentials';
import { savePotluckConfig, upsertDonation } from './potluck';
import { disableModelOrProvider } from './admin-model-overrides';
import * as auditLog from '$lib/server/audit-log';
import { NoCredentialError, ProviderDisabledError } from '$lib/provider/errors';
import type { ProviderId } from './types';

vi.mock('$env/dynamic/private', () => ({
	env: process.env
}));

vi.mock('$lib/server/audit-log', () => ({
	log: vi.fn().mockResolvedValue(undefined)
}));

const ENCRYPTION_KEY = 'edapex-default-encryption-key-32ch';
const ENV = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
const USER_ID = 98100;
const ACTOR_ID = 98101;
const SCHOOL_ID = 98100;

async function cleanup(): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, USER_ID)));
	await db.delete(providerAccessPolicy).where(eq(providerAccessPolicy.schoolId, SCHOOL_ID));
	await db.delete(potluckConfig).where(eq(potluckConfig.schoolId, SCHOOL_ID));
	await db
		.delete(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'school'),
				eq(encryptedCredentials.credentialKind, 'donation'),
				eq(encryptedCredentials.schoolId, SCHOOL_ID)
			)
		);
}

async function seedPersonalCredential(providerId: ProviderId = 'groq'): Promise<void> {
	await saveUserCredential(
		getAppDb(),
		ENV,
		{
			userId: USER_ID,
			providerId,
			credentialType: 'credential',
			apiKey: `personal-${providerId}-key`,
			enabled: true
		}
	);
}

async function seedPool(providerId: ProviderId = 'groq'): Promise<void> {
	await savePotluckConfig(
		getAppDb(),
		SCHOOL_ID,
		{
			enabled: 1,
			donorRoles: '[]',
			consumerRoles: '[]',
			allowedProviders: '[]',
			perUserDailyTokenCap: 100000,
			perUserDailyRequestCap: 500,
			auditRetentionDays: 90,
			tosVersion: 'v1'
		},
		ACTOR_ID
	);
	await upsertDonation(
		getAppDb(),
		ENV,
		SCHOOL_ID,
		providerId,
		`pool-${providerId}-key`,
		ACTOR_ID,
		ACTOR_ID,
		'v1'
	);
}

describe('resolver 4-table integration', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		delete process.env.GROQ_API_KEY;
		delete process.env.DEEPSEEK_API_KEY;
		await cleanup();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		delete process.env.GROQ_API_KEY;
		delete process.env.DEEPSEEK_API_KEY;
		await cleanup();
	});

	it('serves tier 1 from encrypted_credentials when personal credential exists', async () => {
		await seedPersonalCredential();

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('user');
		expect(resolved.tier).toBe(1);
		expect(resolved.providerId).toBe('groq');
		expect(resolved.config).toMatchObject({ apiKey: 'personal-groq-key' });
	});

	it('serves tier 2 from encrypted_credentials donations when pool is enabled and no personal credential', async () => {
		await seedPool();

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('pool');
		expect(resolved.tier).toBe(2);
		expect(resolved.config).toMatchObject({ apiKey: 'pool-groq-key' });
	});

	it('serves tier 3 from env key when no personal credential and pool unavailable', async () => {
		process.env.GROQ_API_KEY = 'env-groq-key';
		await savePotluckConfig(
			getAppDb(),
			SCHOOL_ID,
			{
				enabled: 0,
				donorRoles: '[]',
				consumerRoles: '[]',
				allowedProviders: '[]',
				perUserDailyTokenCap: 0,
				perUserDailyRequestCap: 0,
				auditRetentionDays: 90
			},
			ACTOR_ID
		);

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
		expect(resolved.config).toMatchObject({ apiKey: 'env-groq-key' });
	});

	it('throws NoCredentialError when all four tiers fail', async () => {
		await savePotluckConfig(
			getAppDb(),
			SCHOOL_ID,
			{
				enabled: 0,
				donorRoles: '[]',
				consumerRoles: '[]',
				allowedProviders: '[]',
				perUserDailyTokenCap: 0,
				perUserDailyRequestCap: 0,
				auditRetentionDays: 90
			},
			ACTOR_ID
		);

		await expect(
			resolveModelForRequest(
				USER_ID,
				'groq/llama-3.3-70b-versatile',
				getAppDb(),
				{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
				{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
			)
		).rejects.toBeInstanceOf(NoCredentialError);
	});

	it('throws ProviderDisabledError when personal credential is explicitly disabled', async () => {
		await saveUserCredential(
			getAppDb(),
			ENV,
			{
				userId: USER_ID,
				providerId: 'groq',
				credentialType: 'credential',
				apiKey: 'personal-groq-key',
				enabled: false
			}
		);

		await expect(
			resolveModelForRequest(
				USER_ID,
				'groq/llama-3.3-70b-versatile',
				getAppDb(),
				{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
				{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
			)
		).rejects.toBeInstanceOf(ProviderDisabledError);
	});

	it('writes audit logs for both resolver and tier-router on success', async () => {
		await seedPersonalCredential();

		await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		const calls = vi.mocked(auditLog.log).mock.calls;
		const resolverAccess = calls.find((c) => c[0].entityType === 'providerResolution');
		const keyAccess = calls.find((c) => c[0].entityType === 'providerKey');

		expect(resolverAccess).toBeDefined();
		expect(resolverAccess![0].after).toMatchObject({
			provider: 'groq',
			model: 'groq/llama-3.3-70b-versatile',
			tier: 1,
			keySource: 'user',
			outcome: 'success'
		});

		expect(keyAccess).toBeDefined();
		expect(keyAccess![0].after).toMatchObject({
			tier: 1,
			source: 'user'
		});
	});

	it('writes audit logs when all tiers fail', async () => {
		await savePotluckConfig(
			getAppDb(),
			SCHOOL_ID,
			{
				enabled: 0,
				donorRoles: '[]',
				consumerRoles: '[]',
				allowedProviders: '[]',
				perUserDailyTokenCap: 0,
				perUserDailyRequestCap: 0,
				auditRetentionDays: 90
			},
			ACTOR_ID
		);

		await expect(
			resolveModelForRequest(
				USER_ID,
				'groq/llama-3.3-70b-versatile',
				getAppDb(),
				{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
				{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
			)
		).rejects.toBeInstanceOf(NoCredentialError);

		const calls = vi.mocked(auditLog.log).mock.calls;
		const keyAccess = calls.find((c) => c[0].entityType === 'providerKey');
		expect(keyAccess).toBeDefined();
		expect(keyAccess![0].after).toMatchObject({ tier: 4 });
	});

	it('applies provider_access_policy provider-wide deny to skip pool tier', async () => {
		await seedPool();
		process.env.GROQ_API_KEY = 'env-groq-key';
		await disableModelOrProvider(getAppDb(), SCHOOL_ID, 'groq', null, ACTOR_ID, 'maintenance');

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
	});

	it('honors allowed_providers in potluck_config to restrict pool tier', async () => {
		process.env.GROQ_API_KEY = 'env-groq-key';
		await savePotluckConfig(
			getAppDb(),
			SCHOOL_ID,
			{
				enabled: 1,
				donorRoles: '[]',
				consumerRoles: '[]',
				allowedProviders: JSON.stringify(['deepseek']),
				perUserDailyTokenCap: 100000,
				perUserDailyRequestCap: 500,
				auditRetentionDays: 90,
				tosVersion: 'v1'
			},
			ACTOR_ID
		);
		await upsertDonation(getAppDb(), ENV, SCHOOL_ID, 'groq', 'pool-groq-key', ACTOR_ID, ACTOR_ID, 'v1');

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
	});

	it('returns variant options for requested variant suffix', async () => {
		await seedPersonalCredential();

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/qwen/qwen3-32b@fast',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.variantId).toBe('fast');
		expect(resolved.providerOptions).toBeDefined();
		expect(resolved.providerOptions).toHaveProperty('groq');
	});

	it('pickDefaultModelId returns the default model when personal credential exists', async () => {
		await seedPersonalCredential();

		const modelId = await pickDefaultModelId(getAppDb(), { GROQ_API_KEY: 'env-groq-key' }, USER_ID);
		expect(modelId).not.toBeNull();
		expect(modelId).toContain('groq/');
	});

	it('pickDefaultModelId returns null when no credentials are available', async () => {
		const modelId = await pickDefaultModelId(getAppDb(), {}, USER_ID);
		expect(modelId).toBeNull();
	});

	it('skips pool tier when no potluck config exists', async () => {
		process.env.GROQ_API_KEY = 'env-groq-key';

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
	});

	it('skips pool tier when user role is not in consumerRoles', async () => {
		process.env.GROQ_API_KEY = 'env-groq-key';
		await savePotluckConfig(
			getAppDb(),
			SCHOOL_ID,
			{
				enabled: 1,
				donorRoles: '[]',
				consumerRoles: JSON.stringify(['teacher']),
				allowedProviders: '[]',
				perUserDailyTokenCap: 100000,
				perUserDailyRequestCap: 500,
				auditRetentionDays: 90,
				tosVersion: 'v1'
			},
			ACTOR_ID
		);
		await upsertDonation(getAppDb(), ENV, SCHOOL_ID, 'groq', 'pool-groq-key', ACTOR_ID, ACTOR_ID, 'v1');

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
	});

	it('skips pool tier when provider is not in allowedProviders', async () => {
		process.env.GROQ_API_KEY = 'env-groq-key';
		await savePotluckConfig(
			getAppDb(),
			SCHOOL_ID,
			{
				enabled: 1,
				donorRoles: '[]',
				consumerRoles: '[]',
				allowedProviders: JSON.stringify(['deepseek']),
				perUserDailyTokenCap: 100000,
				perUserDailyRequestCap: 500,
				auditRetentionDays: 90,
				tosVersion: 'v1'
			},
			ACTOR_ID
		);
		await upsertDonation(getAppDb(), ENV, SCHOOL_ID, 'groq', 'pool-groq-key', ACTOR_ID, ACTOR_ID, 'v1');

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
	});

	it('skips pool tier when per-user daily token cap is exceeded', async () => {
		process.env.GROQ_API_KEY = 'env-groq-key';
		await savePotluckConfig(
			getAppDb(),
			SCHOOL_ID,
			{
				enabled: 1,
				donorRoles: '[]',
				consumerRoles: '[]',
				allowedProviders: '[]',
				perUserDailyTokenCap: 100,
				perUserDailyRequestCap: 500,
				auditRetentionDays: 90,
				tosVersion: 'v1'
			},
			ACTOR_ID
		);
		await upsertDonation(getAppDb(), ENV, SCHOOL_ID, 'groq', 'pool-groq-key', ACTOR_ID, ACTOR_ID, 'v1');

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{
				userId: USER_ID,
				schoolId: SCHOOL_ID,
				actorStaffId: ACTOR_ID,
				userRole: 'student',
				todayTokenUsage: 150
			}
		);

		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
	});

	it('skips pool tier when donation ToS version does not match config', async () => {
		process.env.GROQ_API_KEY = 'env-groq-key';
		await savePotluckConfig(
			getAppDb(),
			SCHOOL_ID,
			{
				enabled: 1,
				donorRoles: '[]',
				consumerRoles: '[]',
				allowedProviders: '[]',
				perUserDailyTokenCap: 100000,
				perUserDailyRequestCap: 500,
				auditRetentionDays: 90,
				tosVersion: 'v2'
			},
			ACTOR_ID
		);
		await upsertDonation(getAppDb(), ENV, SCHOOL_ID, 'groq', 'pool-groq-key', ACTOR_ID, ACTOR_ID, 'v1');

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
	});

	it('falls through to env tier when donation decryption fails', async () => {
		process.env.GROQ_API_KEY = 'env-groq-key';
		await savePotluckConfig(
			getAppDb(),
			SCHOOL_ID,
			{
				enabled: 1,
				donorRoles: '[]',
				consumerRoles: '[]',
				allowedProviders: '[]',
				perUserDailyTokenCap: 100000,
				perUserDailyRequestCap: 500,
				auditRetentionDays: 90,
				tosVersion: 'v1'
			},
			ACTOR_ID
		);
		await upsertDonation(
			getAppDb(),
			ENV,
			SCHOOL_ID,
			'groq',
			'not-valid-encrypted-data',
			ACTOR_ID,
			ACTOR_ID,
			'v1'
		);

		const resolved = await resolveModelForRequest(
			USER_ID,
			'groq/llama-3.3-70b-versatile',
			getAppDb(),
			{ actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID },
			{ userId: USER_ID, schoolId: SCHOOL_ID, actorStaffId: ACTOR_ID, userRole: 'student' }
		);

		expect(resolved.keySource).toBe('env');
		expect(resolved.tier).toBe(3);
	});
});
