import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { potluckConfig, potluckDonations } from '$lib/server/mastra/storage/libsql/app-db.schema';
import {
	getPotluckConfig,
	savePotluckConfig,
	listDonations,
	findActiveDonationForProvider,
	upsertDonation,
	deactivateDonation,
	parseJsonArray,
	stringifyJsonArray
} from './potluck';
import * as auditLog from '$lib/server/audit-log';

vi.mock('$lib/server/audit-log', () => ({
	log: vi.fn().mockResolvedValue(undefined)
}));

const SCHOOL_ID = 98500;
const DONOR_ID = 98501;
const ACTOR_ID = 98502;

async function cleanup(): Promise<void> {
	const db = getAppDb();
	await db.delete(potluckConfig).where(eq(potluckConfig.schoolId, SCHOOL_ID));
	await db.delete(potluckDonations).where(eq(potluckDonations.schoolId, SCHOOL_ID));
}

describe('potluck', () => {
	beforeEach(cleanup);
	afterEach(cleanup);

	it('returns null config when absent', async () => {
		const db = getAppDb();
		const config = await getPotluckConfig(db, SCHOOL_ID);
		expect(config).toBeNull();
	});

	it('creates and updates config', async () => {
		const db = getAppDb();
		const created = await savePotluckConfig(db, SCHOOL_ID, { enabled: 1 }, DONOR_ID);
		expect(created.enabled).toBe(1);
		expect(created.schoolId).toBe(SCHOOL_ID);

		const updated = await savePotluckConfig(
			db,
			SCHOOL_ID,
			{ donorRoles: 'teacher,it' },
			DONOR_ID,
			{ actorStaffId: ACTOR_ID }
		);
		expect(updated.donorRoles).toBe('teacher,it');
		expect(auditLog.log).toHaveBeenCalled();
	});

	it('upserts and lists donations', async () => {
		const db = getAppDb();
		await upsertDonation(db, SCHOOL_ID, 'groq', 'enc-key', DONOR_ID, DONOR_ID, 'v1', {
			actorStaffId: ACTOR_ID
		});
		const all = await listDonations(db, SCHOOL_ID);
		expect(all.length).toBe(1);
		expect(all[0].providerId).toBe('groq');
	});

	it('lists only active donations when activeOnly is true', async () => {
		const db = getAppDb();
		const donation = await upsertDonation(db, SCHOOL_ID, 'groq', 'enc-key', DONOR_ID, DONOR_ID, 'v1');
		await deactivateDonation(db, donation.id);
		const active = await listDonations(db, SCHOOL_ID, { activeOnly: true });
		expect(active.length).toBe(0);
	});

	it('finds active donation for provider', async () => {
		const db = getAppDb();
		await upsertDonation(db, SCHOOL_ID, 'groq', 'enc-key', DONOR_ID, DONOR_ID, 'v1');
		const found = await findActiveDonationForProvider(db, SCHOOL_ID, 'groq');
		expect(found).not.toBeNull();
		expect(found?.providerId).toBe('groq');
	});

	it('returns null when no active donation for provider', async () => {
		const db = getAppDb();
		const found = await findActiveDonationForProvider(db, SCHOOL_ID, 'deepseek');
		expect(found).toBeNull();
	});

	it('reactivates an inactive donation on upsert', async () => {
		const db = getAppDb();
		const donation = await upsertDonation(db, SCHOOL_ID, 'groq', 'enc-key', DONOR_ID, DONOR_ID, 'v1');
		await deactivateDonation(db, donation.id);
		await upsertDonation(db, SCHOOL_ID, 'groq', 'enc-key', DONOR_ID, DONOR_ID, 'v1');
		const found = await findActiveDonationForProvider(db, SCHOOL_ID, 'groq');
		expect(found?.isActive).toBe(1);
	});

	it('deactivateDonation writes audit log when audit provided', async () => {
		const db = getAppDb();
		const donation = await upsertDonation(db, SCHOOL_ID, 'groq', 'enc-key', DONOR_ID, DONOR_ID, 'v1');
		await deactivateDonation(db, donation.id, { actorStaffId: ACTOR_ID, schoolId: SCHOOL_ID });
		expect(auditLog.log).toHaveBeenCalled();
	});

	it('parseJsonArray handles null, empty, and invalid JSON', () => {
		expect(parseJsonArray(null)).toEqual([]);
		expect(parseJsonArray('')).toEqual([]);
		expect(parseJsonArray('not json')).toEqual([]);
		expect(parseJsonArray('["a", 1, "b"]')).toEqual(['a', 'b']);
	});

	it('stringifyJsonArray filters non-strings', () => {
		expect(stringifyJsonArray(['a', 'b'])).toBe('["a","b"]');
		expect(stringifyJsonArray(['a', 1 as any, 'b'])).toBe('["a","b"]');
	});
});
