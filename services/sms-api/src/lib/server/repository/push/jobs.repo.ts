import { and, eq, gte, sql } from "drizzle-orm";

import { pushJobs } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type JobStatus = "queued" | "sent" | "failed" | "skipped";

export interface JobClaim {
  readonly eventId: string;
  readonly userId: number;
  readonly kind: string;
  readonly key: string;
  readonly createdAt: number;
}

/**
 * Claim the delivery, or learn that this pair already has one.
 *
 * The insert is the lock: `idempotency_key` is unique, so two consumers racing
 * on the same event produce one row and one notification.
 */
export async function claimJob(ctx: ScopedRepositoryContext, claim: JobClaim): Promise<boolean> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .insert(pushJobs)
      .values({
        eventId: claim.eventId,
        schoolId: ctx.tenant.schoolId,
        userId: claim.userId,
        kind: claim.kind,
        idempotencyKey: claim.key,
        status: "queued",
        createdAt: claim.createdAt
      })
      .onConflictDoNothing({ target: pushJobs.idempotencyKey })
      .returning({ id: pushJobs.id });
    return rows.length > 0;
  }, "claimJob");
}

export async function settleJob(
  ctx: ScopedRepositoryContext,
  key: string,
  status: JobStatus,
  error: string | null,
  now: number
): Promise<void> {
  return withErrorHandling(async () => {
    await ctx.db
      .update(pushJobs)
      .set({
        status,
        error,
        attempts: sql`${pushJobs.attempts} + 1`,
        ...(status === "sent" ? { sentAt: now } : {})
      })
      .where(eq(pushJobs.idempotencyKey, key));
  }, "settleJob");
}

/** How many of this kind have reached this person inside the storm window. */
export async function countRecentKind(
  ctx: ScopedRepositoryContext,
  userId: number,
  kind: string,
  since: number
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({ total: sql<number>`count(*)` })
      .from(pushJobs)
      .where(
        and(
          eq(pushJobs.userId, userId),
          eq(pushJobs.kind, kind),
          eq(pushJobs.schoolId, ctx.tenant.schoolId),
          gte(pushJobs.createdAt, since)
        )
      );
    return rows[0]?.total ?? 0;
  }, "countRecentKind");
}
