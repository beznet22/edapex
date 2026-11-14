import { and, eq, lt, sql } from "drizzle-orm";

import { authRateLimits } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { UnscopedRepositoryContext } from "../base/repository-context";

/**
 * Brute-force state is data, not a process-local `Map` (`02 §6`). The key is
 * composed by the service and includes the school/user/ip discriminator.
 */
export async function readRateLimit(
  ctx: UnscopedRepositoryContext,
  key: string,
  windowStart: number
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ count: authRateLimits.count })
      .from(authRateLimits)
      .where(
        and(eq(authRateLimits.key, key), eq(authRateLimits.windowStart, windowStart))
      )
      .limit(1);
    return row?.count ?? 0;
  }, "readRateLimit");
}

export async function incrementRateLimit(
  ctx: UnscopedRepositoryContext,
  key: string,
  windowStart: number
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .insert(authRateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [authRateLimits.key, authRateLimits.windowStart],
        set: { count: sql`${authRateLimits.count} + 1` }
      })
      .returning({ count: authRateLimits.count });
    return row?.count ?? 1;
  }, "incrementRateLimit");
}

export interface RateLimitEntry {
  readonly key: string;
  readonly windowStart: number;
}

/**
 * All of a request's windows increment in one D1 round trip. The claim path
 * has four windows, so batching removes four sequential round trips
 * (`01a O15`).
 */
export async function incrementRateLimits(
  ctx: UnscopedRepositoryContext,
  entries: readonly RateLimitEntry[]
): Promise<readonly number[]> {
  if (entries.length === 0) return [];
  return withErrorHandling(async () => {
    const statements = entries.map((entry) =>
      ctx.db
        .insert(authRateLimits)
        .values({ key: entry.key, windowStart: entry.windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [authRateLimits.key, authRateLimits.windowStart],
          set: { count: sql`${authRateLimits.count} + 1` }
        })
        .returning({ count: authRateLimits.count })
    );
    const [first, ...rest] = statements;
    if (first === undefined) return [];
    const results = await ctx.db.batch([first, ...rest]);
    return results.map((rows) => rows[0]?.count ?? 1);
  }, "incrementRateLimits");
}

export async function deleteRateLimitsBefore(
  ctx: UnscopedRepositoryContext,
  before: number
): Promise<number> {
  return withErrorHandling(async () => {
    const deleted = await ctx.db
      .delete(authRateLimits)
      .where(lt(authRateLimits.windowStart, before))
      .returning({ key: authRateLimits.key });
    return deleted.length;
  }, "deleteRateLimitsBefore");
}

export async function deleteRateLimit(
  ctx: UnscopedRepositoryContext,
  key: string
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.delete(authRateLimits).where(eq(authRateLimits.key, key));
    },
    "deleteRateLimit"
  );
}
