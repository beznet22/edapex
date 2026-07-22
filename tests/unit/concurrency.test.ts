import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import {
	encryptedCredentials,
	modelVisibility,
	providerAccessPolicy,
	potluckConfig
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import { saveUserCredential } from '$lib/server/mastra/provider/credentials';
import { setModelVisibility } from '$lib/server/mastra/provider/visibility';
import { disableModelOrProvider } from '$lib/server/mastra/provider/admin-model-overrides';
import { savePotluckConfig, upsertDonation } from '$lib/server/mastra/provider/potluck';

const SCHOOL = 98001;
const USER_ID = 9801;
const PROVIDER = 'groq';
const MODEL_ID = 'concurrency-test-model';
const ENCRYPTION_KEY = 'edapex-default-encryption-key-32ch';

async function cleanupDb(): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, USER_ID)));
	await db
		.delete(modelVisibility)
		.where(and(eq(modelVisibility.scope, 'user'), eq(modelVisibility.userId, USER_ID)));
	await db.delete(providerAccessPolicy).where(eq(providerAccessPolicy.schoolId, SCHOOL));
	await db.delete(potluckConfig).where(eq(potluckConfig.schoolId, SCHOOL));
	await db
		.delete(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'school'),
				eq(encryptedCredentials.credentialKind, 'donation'),
				eq(encryptedCredentials.schoolId, SCHOOL)
			)
		);
}

describe('concurrent provider table writes', () => {
	beforeEach(cleanupDb);
	afterEach(cleanupDb);

	it('encrypted_credentials: 50 concurrent saves for the same key leave exactly one row', async () => {
		const db = getAppDb();
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
		const okFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ data: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
		) as unknown as typeof fetch;

		const writes = Array.from({ length: 50 }, () =>
			saveUserCredential(db, env, {
				userId: USER_ID,
				providerId: PROVIDER,
				credentialType: 'credential',
				apiKey: 'sk-concurrent-test',
				priority: 1,
				enabled: true,
				fetchImpl: okFetch
			})
		);

		const results = await Promise.all(writes);
		expect(results).toHaveLength(50);

		const count = await db.$count(
			encryptedCredentials,
			and(
				eq(encryptedCredentials.scope, 'user'),
				eq(encryptedCredentials.userId, USER_ID),
				eq(encryptedCredentials.providerId, PROVIDER)
			)
		);
		expect(count).toBe(1);
	});

	it('model_visibility: 50 concurrent sets for the same key leave exactly one row', async () => {
		const db = getAppDb();

		const writes = Array.from({ length: 50 }, () =>
			setModelVisibility(db, USER_ID, MODEL_ID, false)
		);

		const results = await Promise.all(writes);
		expect(results).toHaveLength(50);

		const count = await db.$count(
			modelVisibility,
			and(
				eq(modelVisibility.scope, 'user'),
				eq(modelVisibility.userId, USER_ID),
				eq(modelVisibility.modelId, MODEL_ID)
			)
		);
		expect(count).toBe(1);
	});

	it('provider_access_policy: 50 concurrent disables for the same key leave exactly one row', async () => {
		const db = getAppDb();

		const writes = Array.from({ length: 50 }, () =>
			disableModelOrProvider(db, SCHOOL, PROVIDER, MODEL_ID, USER_ID, 'race-test')
		);

		const results = await Promise.all(writes);
		expect(results).toHaveLength(50);
		expect(results.every((row) => row !== null)).toBe(true);

		const count = await db.$count(
			providerAccessPolicy,
			and(
				eq(providerAccessPolicy.schoolId, SCHOOL),
				eq(providerAccessPolicy.ruleType, 'deny'),
				eq(providerAccessPolicy.providerId, PROVIDER),
				eq(providerAccessPolicy.modelId, MODEL_ID)
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

	it('encrypted_credentials donations: 50 concurrent upserts for the same key leave exactly one row', async () => {
		const db = getAppDb();
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };

		const writes = Array.from({ length: 50 }, () =>
			upsertDonation(db, env, SCHOOL, PROVIDER, 'sk-donation-concurrent', USER_ID, USER_ID, 'v1')
		);

		const results = await Promise.all(writes);
		expect(results).toHaveLength(50);

		const count = await db.$count(
			encryptedCredentials,
			and(
				eq(encryptedCredentials.scope, 'school'),
				eq(encryptedCredentials.credentialKind, 'donation'),
				eq(encryptedCredentials.schoolId, SCHOOL),
				eq(encryptedCredentials.providerId, PROVIDER)
			)
		);
		expect(count).toBe(1);
	});
});
