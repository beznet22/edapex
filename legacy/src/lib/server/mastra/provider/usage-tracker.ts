/**
 * Per-user daily token + request usage tracker.
 *
 * Powers `potluck_config.perUserDailyTokenCap` enforcement. Read at
 * request time by the 4-tier router (tier 2 short-circuits when today's
 * sum exceeds the cap) and written from the chat-pipeline completion hook
 * (`chat.remote.ts` -> onFinish) once an AI SDK v2 stream reports its
 * `usage` field.
 *
 * Atomic upsert: every call to `recordUsage` is a single `INSERT ... ON
 * CONFLICT DO UPDATE SET tokens = tokens + excluded.tokens` so two
 * parallel chat turns from the same user can't lose a delta.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { tokenUsage } from '$lib/server/mastra/storage/libsql/app-db.schema';

/** Returns today's UTC date as `YYYY-MM-DD`. */
export function utcDayKey(date: Date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

export interface RecordUsageArgs {
	db: LibSQLDatabase<any>;
	userId: number;
	providerId: string;
	/** Token count (input + output). Negative values are ignored. */
	tokens: number;
	/** When the call happened — defaults to now. UTC day is computed from this. */
	at?: Date;
	/** Request counter increment; defaults to 1. */
	requests?: number;
}

/**
 * Increment today's `tokens` and `requests` counters for `(userId, day, providerId)`.
 * Returns the new totals for the row, or `null` if the inputs were invalid.
 *
 * Designed to be called from the chat-completion hook. Errors are logged
 * and swallowed — a failed write must never crash the response stream.
 */
export async function recordUsage(args: RecordUsageArgs): Promise<{
	day: string;
	tokens: number;
	requests: number;
} | null> {
	if (args.tokens < 0 || !Number.isFinite(args.tokens)) {
		return null;
	}
	if (args.tokens === 0 && (args.requests ?? 1) === 0) {
		return null;
	}
	const day = utcDayKey(args.at);
	const inc = Math.max(0, Math.floor(args.requests ?? 1));
	try {
		const result = await args.db
			.insert(tokenUsage)
			.values({
				userId: args.userId,
				day,
				providerId: args.providerId,
				tokens: Math.floor(args.tokens),
				requests: inc,
				updatedAt: new Date().toISOString()
			})
			.onConflictDoUpdate({
				target: [tokenUsage.userId, tokenUsage.day, tokenUsage.providerId],
				set: {
					tokens: sql`${tokenUsage.tokens} + ${Math.floor(args.tokens)}`,
					requests: sql`${tokenUsage.requests} + ${inc}`,
					updatedAt: new Date().toISOString()
				}
			})
			.returning({
				day: tokenUsage.day,
				tokens: tokenUsage.tokens,
				requests: tokenUsage.requests
			});
		const row = result[0];
		if (!row) return null;
		return {
			day: row.day,
			tokens: row.tokens,
			requests: row.requests
		};
	} catch (err) {
		console.error('[usage-tracker] recordUsage failed', err);
		return null;
	}
}

export interface GetUsageArgs {
	db: LibSQLDatabase<any>;
	userId: number;
	providerId?: string;
	/** Defaults to today (UTC). */
	day?: string;
}

/**
 * Sum today's tokens (and request count) for the user. When `providerId`
 * is supplied, returns totals for that provider only.
 */
export async function getTodayTokenUsage(args: GetUsageArgs): Promise<number> {
	const day = args.day ?? utcDayKey();
	try {
		const rows = await args.db
			.select({
				tokens: tokenUsage.tokens
			})
			.from(tokenUsage)
			.where(
				args.providerId
					? sql`${tokenUsage.userId} = ${args.userId} AND ${tokenUsage.day} = ${day} AND ${tokenUsage.providerId} = ${args.providerId}`
					: sql`${tokenUsage.userId} = ${args.userId} AND ${tokenUsage.day} = ${day}`
			);
		let total = 0;
		for (const r of rows) total += r.tokens;
		return total;
	} catch (err) {
		console.error('[usage-tracker] getTodayTokenUsage failed', err);
		return 0;
	}
}
