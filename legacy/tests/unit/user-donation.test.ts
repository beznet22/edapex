import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { encryptedCredentials, potluckConfig } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { savePotluckConfig } from '$lib/server/mastra/provider/potluck';
import {
	donateUserCredential,
	listMyDonations,
	revokeMyDonation
} from '$lib/server/service/user-donation.service';

vi.mock('$lib/server/audit-log', () => ({
	log: vi.fn().mockResolvedValue(undefined)
}));

const SCHOOL_ID = 98700;
const USER_ID = 98701;
const OTHER_USER_ID = 98702;
const STAFF_ID = 98703;
const ENCRYPTION_KEY = 'edapex-default-encryption-key-32ch';

async function cleanup(): Promise<void> {
	const db = getAppDb();
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

async function enablePool(donorRoles: string[], tosVersion: string | null = 'v1'): Promise<void> {
	await savePotluckConfig(getAppDb(), SCHOOL_ID, {
		enabled: 1,
		donorRoles: JSON.stringify(donorRoles),
		consumerRoles: '[]',
		allowedProviders: '[]',
		perUserDailyTokenCap: 0,
		perUserDailyRequestCap: 0,
		perProviderDailyTokenCap: null,
		auditRetentionDays: 90,
		tosVersion,
		updatedBy: STAFF_ID
	}, STAFF_ID);
}

async function disablePool(): Promise<void> {
	await savePotluckConfig(getAppDb(), SCHOOL_ID, {
		enabled: 0,
		donorRoles: '[]',
		consumerRoles: '[]',
		allowedProviders: '[]',
		perUserDailyTokenCap: 0,
		perUserDailyRequestCap: 0,
		perProviderDailyTokenCap: null,
		auditRetentionDays: 90,
		tosVersion: null,
		updatedBy: STAFF_ID
	}, STAFF_ID);
}

describe('donateUserCredential', () => {
	beforeEach(cleanup);
	afterEach(cleanup);

	it('rejects when pool is disabled', async () => {
		await disablePool();
		const res = await donateUserCredential({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'class_teacher',
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-key-12345',
			env: { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any
		});
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/not enabled/i);
	});

	it('rejects when user role is not in donorRoles', async () => {
		await enablePool(['class_teacher']);
		const res = await donateUserCredential({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'it', // not a donor
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-key-12345',
			env: { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any
		});
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/role cannot donate/i);
	});

	it('accepts when user role is in donorRoles', async () => {
		await enablePool(['class_teacher']);
		const res = await donateUserCredential({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'class_teacher',
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-key-12345',
			env: { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any
		});
		expect(res.success).toBe(true);
		expect(res.donation?.donatedBy).toBe(USER_ID);
	});

	it('accepts when donorRoles is empty (permissive default)', async () => {
		await enablePool([]);
		const res = await donateUserCredential({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'it',
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-key-12345',
			env: { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any
		});
		expect(res.success).toBe(true);
	});

	it('rejects when userRole is null and donorRoles is non-empty', async () => {
		await enablePool(['class_teacher']);
		const res = await donateUserCredential({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			userRole: null,
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-key-12345',
			env: { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any
		});
		expect(res.success).toBe(false);
	});

	it('records ToS version and tosAcceptedBy when tosVersion is set', async () => {
		await enablePool([], 'v2');
		const res = await donateUserCredential({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'class_teacher',
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-key-12345',
			env: { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any
		});
		expect(res.success).toBe(true);
		expect(res.donation?.tosVersion).toBe('v2');
		expect(res.donation?.tosAcceptedBy).toBe(USER_ID);
	});

	it('leaves ToS blank when tosVersion is null', async () => {
		await enablePool([], null);
		const res = await donateUserCredential({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'class_teacher',
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-key-12345',
			env: { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any
		});
		expect(res.success).toBe(true);
		expect(res.donation?.tosVersion).toBeNull();
	});
});

describe('listMyDonations', () => {
	beforeEach(cleanup);
	afterEach(cleanup);

	it('returns only my donations for this school', async () => {
		await enablePool([]);
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any;
		// User donates to groq
		await donateUserCredential({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'class_teacher',
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-groq-1234',
			env
		});
		// Other user donates to deepseek
		await donateUserCredential({
			db: getAppDb(),
			userId: OTHER_USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'class_teacher',
			staffId: STAFF_ID,
			providerId: 'deepseek',
			apiKey: 'sk-test-deepseek-1234',
			env
		});

		const myList = await listMyDonations({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			env
		});
		expect(myList).toHaveLength(1);
		expect(myList[0].providerId).toBe('groq');
		expect(myList[0].donatedBy).toBe(USER_ID);
	});

	it('returns empty when user has no donations', async () => {
		await enablePool([]);
		const myList = await listMyDonations({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			env: { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any
		});
		expect(myList).toHaveLength(0);
	});
});

describe('revokeMyDonation', () => {
	beforeEach(cleanup);
	afterEach(cleanup);

	it('deactivates the user own donation', async () => {
		await enablePool([]);
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any;
		const res = await donateUserCredential({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'class_teacher',
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-groq-1234',
			env
		});
		expect(res.success).toBe(true);
		const donationId = res.donation!.id;

		const revokeRes = await revokeMyDonation({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			staffId: STAFF_ID,
			donationId
		});
		expect(revokeRes.success).toBe(true);

		// After revoke, listMyDonations returns nothing (active filter)
		const after = await listMyDonations({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			env
		});
		expect(after).toHaveLength(0);
	});

	it('rejects revoking another user donation', async () => {
		await enablePool([]);
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY } as any;
		// Other user donates
		const res = await donateUserCredential({
			db: getAppDb(),
			userId: OTHER_USER_ID,
			schoolId: SCHOOL_ID,
			userRole: 'class_teacher',
			staffId: STAFF_ID,
			providerId: 'groq',
			apiKey: 'sk-test-groq-1234',
			env
		});
		expect(res.success).toBe(true);
		const donationId = res.donation!.id;

		// User tries to revoke the other user donation
		const revokeRes = await revokeMyDonation({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			staffId: STAFF_ID,
			donationId
		});
		expect(revokeRes.success).toBe(false);
		expect(revokeRes.error).toMatch(/only revoke your own/i);
	});

	it('rejects revoking a non-existent donation', async () => {
		const revokeRes = await revokeMyDonation({
			db: getAppDb(),
			userId: USER_ID,
			schoolId: SCHOOL_ID,
			staffId: STAFF_ID,
			donationId: 'nonexistent-id'
		});
		expect(revokeRes.success).toBe(false);
	});
});
