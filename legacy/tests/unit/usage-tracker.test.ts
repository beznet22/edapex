import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { and, eq, or } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { tokenUsage } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { recordUsage, getTodayTokenUsage, utcDayKey } from '$lib/server/mastra/provider/usage-tracker';

const USER_ID = 98900;
const OTHER_USER_ID = 98901;

async function cleanup(): Promise<void> {
	const db = getAppDb();
	await db
		.delete(tokenUsage)
		.where(or(eq(tokenUsage.userId, USER_ID), eq(tokenUsage.userId, OTHER_USER_ID)));
}

describe('utcDayKey', () => {
	it('returns YYYY-MM-DD UTC', () => {
		const d = new Date('2026-07-17T10:30:00Z');
		expect(utcDayKey(d)).toBe('2026-07-17');
	});

	it('defaults to today', () => {
		const today = new Date().toISOString().slice(0, 10);
		expect(utcDayKey()).toBe(today);
	});
});

describe('recordUsage', () => {
	beforeEach(cleanup);
	afterEach(cleanup);

	it('inserts a new row on first call', async () => {
		const res = await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'groq',
			tokens: 100
		});
		expect(res).not.toBeNull();
		expect(res?.tokens).toBe(100);
		expect(res?.requests).toBe(1);
	});

	it('upserts (sums) on second call', async () => {
		await recordUsage({ db: getAppDb(), userId: USER_ID, providerId: 'groq', tokens: 100 });
		const res = await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'groq',
			tokens: 50
		});
		expect(res?.tokens).toBe(150);
		expect(res?.requests).toBe(2);
	});

	it('sums per (userId, providerId) — different providers do not combine', async () => {
		await recordUsage({ db: getAppDb(), userId: USER_ID, providerId: 'groq', tokens: 100 });
		await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'deepseek',
			tokens: 200
		});
		const groqTotal = await getTodayTokenUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'groq'
		});
		const deepseekTotal = await getTodayTokenUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'deepseek'
		});
		expect(groqTotal).toBe(100);
		expect(deepseekTotal).toBe(200);
	});

	it('sums across users (no cross-contamination)', async () => {
		await recordUsage({ db: getAppDb(), userId: USER_ID, providerId: 'groq', tokens: 100 });
		await recordUsage({
			db: getAppDb(),
			userId: OTHER_USER_ID,
			providerId: 'groq',
			tokens: 50
		});
		const userTotal = await getTodayTokenUsage({ db: getAppDb(), userId: USER_ID });
		expect(userTotal).toBe(100);
	});

	it('returns null for negative tokens', async () => {
		const res = await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'groq',
			tokens: -1
		});
		expect(res).toBeNull();
	});

	it('returns null for NaN tokens', async () => {
		const res = await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'groq',
			tokens: Number.NaN
		});
		expect(res).toBeNull();
	});

	it('returns null when both tokens and requests are zero', async () => {
		const res = await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'groq',
			tokens: 0,
			requests: 0
		});
		expect(res).toBeNull();
	});

	it('increments request counter only when tokens=0', async () => {
		const res = await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'groq',
			tokens: 0,
			requests: 1
		});
		expect(res?.requests).toBe(1);
		expect(res?.tokens).toBe(0);
	});

	it('accepts a custom `at` date for the day bucket', async () => {
		const yesterday = new Date('2026-07-16T12:00:00Z');
		const res = await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'groq',
			tokens: 50,
			at: yesterday
		});
		expect(res?.day).toBe('2026-07-16');
	});
});

describe('getTodayTokenUsage', () => {
	beforeEach(cleanup);
	afterEach(cleanup);

	it('returns 0 for a fresh user', async () => {
		const total = await getTodayTokenUsage({ db: getAppDb(), userId: USER_ID });
		expect(total).toBe(0);
	});

	it('returns total across all providers when providerId is omitted', async () => {
		await recordUsage({ db: getAppDb(), userId: USER_ID, providerId: 'groq', tokens: 100 });
		await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'deepseek',
			tokens: 200
		});
		const total = await getTodayTokenUsage({ db: getAppDb(), userId: USER_ID });
		expect(total).toBe(300);
	});

	it('honours a custom day argument', async () => {
		const yesterday = new Date('2026-07-16T12:00:00Z');
		await recordUsage({
			db: getAppDb(),
			userId: USER_ID,
			providerId: 'groq',
			tokens: 50,
			at: yesterday
		});
		const yesterdayTotal = await getTodayTokenUsage({
			db: getAppDb(),
			userId: USER_ID,
			day: '2026-07-16'
		});
		const todayTotal = await getTodayTokenUsage({
			db: getAppDb(),
			userId: USER_ID,
			day: '2026-07-17'
		});
		expect(yesterdayTotal).toBe(50);
		expect(todayTotal).toBe(0);
	});
});
