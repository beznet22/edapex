import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import {
	userCredentials,
	userModelVisibility,
	adminModelOverrides,
	potluckConfig,
	potluckDonations
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import { saveUserCredential } from '$lib/server/mastra/provider/credentials';
import { setModelVisibility } from '$lib/server/mastra/provider/visibility';
import { disableModelOrProvider } from '$lib/server/mastra/provider/admin-model-overrides';
import { savePotluckConfig, upsertDonation } from '$lib/server/mastra/provider/potluck';
import { encrypt } from '$lib/server/mastra/provider/crypto';

const SCHOOL = 98001;
const USER_ID = 9801;
const PROVIDER = 'groq';
const MODEL_ID = 'concurrency-test-model';
const ENCRYPTION_KEY = 'edapex-default-encryption-key-32ch';

async function cleanupDb(): Promise<void> {
	const db = getAppDb();
	await db.delete(userCredentials).where(eq(userCredentials.userId, USER_ID));
	await db.delete(userModelVisibility).where(eq(userModelVisibility.userId, USER_ID));
	await db.delete(adminModelOverrides).where(eq(adminModelOverrides.schoolId, SCHOOL));
	await db.delete(potluckConfig).where(eq(potluckConfig.schoolId, SCHOOL));
	await db.delete(potluckDonations).where(eq(potluckDonations.schoolId, SCHOOL));
}

describe('concurrent provider table writes', () => {
	beforeEach(cleanupDb);
	afterEach(cleanupDb);

	it('user_credentials: 50 concurrent saves for the same key leave exactly one row', async () => {
		const db = getAppDb();
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };

		const writes = Array.from({ length: 50 }, () =>
			saveUserCredential(db, env, {
				userId: USER_ID,
				providerId: PROVIDER,
				credentialType: 'credential',
				apiKey: 'sk-concurrent-test',
				priority: 1,
				enabled: true
			})
		);

		const results = await Promise.all(writes);
		expect(results).toHaveLength(50);

		const count = await db.$count(
			userCredentials,
			and(eq(userCredentials.userId, USER_ID), eq(userCredentials.providerId, PROVIDER))
		);
		expect(count).toBe(1);
	});

	it('user_model_visibility: 50 concurrent sets for the same key leave exactly one row', async () => {
		const db = getAppDb();

		const writes = Array.from({ length: 50 }, () =>
			setModelVisibility(db, USER_ID, MODEL_ID, false)
		);

		const results = await Promise.all(writes);
		expect(results).toHaveLength(50);

		const count = await db.$count(
			userModelVisibility,
			and(eq(userModelVisibility.userId, USER_ID), eq(userModelVisibility.modelId, MODEL_ID))
		);
		expect(count).toBe(1);
	});

	it('admin_model_overrides: 50 concurrent disables for the same key leave exactly one row', async () => {
		const db = getAppDb();

		const writes = Array.from({ length: 50 }, () =>
			disableModelOrProvider(db, SCHOOL, PROVIDER, MODEL_ID, USER_ID, 'race-test')
		);

		const results = await Promise.all(writes);
		expect(results).toHaveLength(50);
		expect(results.every((row) => row !== null)).toBe(true);

		const count = await db.$count(
			adminModelOverrides,
			and(
				eq(adminModelOverrides.schoolId, SCHOOL),
				eq(adminModelOverrides.providerId, PROVIDER),
				eq(adminModelOverrides.modelId, MODEL_ID)
			)
		);
		expect(count).toBe(1);
	});

	it('potluck_config: 50 concurrent saves for the same school leave exactly one row', async () => {
		const db = getAppDb();

		const writes = Array.from({ length: 50 }, () =>
			savePotluckConfig(
				db,
				SCHOOL,
				{
					enabled: 1,
					donorRoles: '[]',
					consumerRoles: '[]',
					allowedProviders: '[]',
					perUserDailyTokenCap: 100,
					perUserDailyRequestCap: 10,
					auditRetentionDays: 90
				},
				USER_ID
			)
		);

		const results = await Promise.all(writes);
		expect(results).toHaveLength(50);

		const count = await db.$count(potluckConfig, eq(potluckConfig.schoolId, SCHOOL));
		expect(count).toBe(1);
	});

	it('potluck_donations: 50 concurrent upserts for the same key leave exactly one row', async () => {
		const db = getAppDb();
		const apiKeyEncrypted = encrypt('sk-donation-concurrent', ENCRYPTION_KEY);

		const writes = Array.from({ length: 50 }, () =>
			upsertDonation(db, SCHOOL, PROVIDER, apiKeyEncrypted, USER_ID, USER_ID, 'v1')
		);

		const results = await Promise.all(writes);
		expect(results).toHaveLength(50);

		const count = await db.$count(
			potluckDonations,
			and(
				eq(potluckDonations.schoolId, SCHOOL),
				eq(potluckDonations.providerId, PROVIDER),
				eq(potluckDonations.donatedBy, USER_ID)
			)
		);
		expect(count).toBe(1);
	});
});
