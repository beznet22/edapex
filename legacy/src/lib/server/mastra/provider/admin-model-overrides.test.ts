import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { providerAccessPolicy } from '$lib/server/mastra/storage/libsql/app-db.schema';
import {
	listAdminOverrides,
	disableModelOrProvider,
	enableModelOrProvider,
	applyAdminDenylist
} from './admin-model-overrides';

const SCHOOL_ID = 98400;
const ADMIN_ID = 98401;

async function cleanup(): Promise<void> {
	const db = getAppDb();
	await db
		.delete(providerAccessPolicy)
		.where(eq(providerAccessPolicy.schoolId, SCHOOL_ID));
}

describe('admin-model-overrides', () => {
	beforeEach(cleanup);
	afterEach(cleanup);

	it('lists overrides for a school', async () => {
		const db = getAppDb();
		await disableModelOrProvider(db, SCHOOL_ID, 'groq', 'llama-3-8b', ADMIN_ID, 'too slow');
		const rows = await listAdminOverrides(db, SCHOOL_ID);
		expect(rows.length).toBe(1);
		expect(rows[0].providerId).toBe('groq');
		expect(rows[0].modelId).toBe('llama-3-8b');
		expect(rows[0].reason).toBe('too slow');
	});

	it('disables a whole provider when modelId is null', async () => {
		const db = getAppDb();
		const row = await disableModelOrProvider(db, SCHOOL_ID, 'groq', null, ADMIN_ID, 'outage');
		expect(row).not.toBeNull();
		expect(row?.modelId).toBeNull();
	});

	it('is idempotent for existing disable', async () => {
		const db = getAppDb();
		await disableModelOrProvider(db, SCHOOL_ID, 'groq', 'llama-3-8b', ADMIN_ID, 'reason-a');
		const row = await disableModelOrProvider(db, SCHOOL_ID, 'groq', 'llama-3-8b', ADMIN_ID, 'reason-b');
		expect(row?.reason).toBe('reason-b');
		const rows = await listAdminOverrides(db, SCHOOL_ID);
		expect(rows.length).toBe(1);
	});

	it('keeps existing reason when new reason is null', async () => {
		const db = getAppDb();
		await disableModelOrProvider(db, SCHOOL_ID, 'groq', 'llama-3-8b', ADMIN_ID, 'reason-a');
		const row = await disableModelOrProvider(db, SCHOOL_ID, 'groq', 'llama-3-8b', ADMIN_ID, null);
		expect(row?.reason).toBe('reason-a');
	});

	it('enables a previously disabled model', async () => {
		const db = getAppDb();
		await disableModelOrProvider(db, SCHOOL_ID, 'groq', 'llama-3-8b', ADMIN_ID, 'x');
		await enableModelOrProvider(db, SCHOOL_ID, 'groq', 'llama-3-8b');
		const rows = await listAdminOverrides(db, SCHOOL_ID);
		expect(rows.length).toBe(0);
	});

	it('enables a previously disabled provider', async () => {
		const db = getAppDb();
		await disableModelOrProvider(db, SCHOOL_ID, 'groq', null, ADMIN_ID, 'x');
		await enableModelOrProvider(db, SCHOOL_ID, 'groq', null);
		const rows = await listAdminOverrides(db, SCHOOL_ID);
		expect(rows.length).toBe(0);
	});

	it('serializes concurrent mutations without crashing', async () => {
		const db = getAppDb();
		await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				disableModelOrProvider(db, SCHOOL_ID, 'groq', `model-${i}`, ADMIN_ID, 'x')
			)
		);
		const rows = await listAdminOverrides(db, SCHOOL_ID);
		expect(rows.length).toBe(5);
	});

	it('applyAdminDenylist filters provider-wide and model-specific blocks', () => {
		const entries = [
			{ providerId: 'groq', modelId: 'a' },
			{ providerId: 'groq', modelId: 'b' },
			{ providerId: 'deepseek', modelId: 'c' }
		];
		const overrides = [
			{ providerId: 'groq', modelId: null } as any,
			{ providerId: 'deepseek', modelId: 'c' } as any
		];
		const allowed = applyAdminDenylist(entries, overrides);
		expect(allowed).toEqual([]);
	});
});
