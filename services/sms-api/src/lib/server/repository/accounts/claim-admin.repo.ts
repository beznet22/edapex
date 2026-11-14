import { and, count, eq, isNotNull, isNull, or } from "drizzle-orm";

import { users } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { ClaimStatus } from "./types";

export interface ClaimStateCounts {
  readonly pending: number;
  readonly claimed: number;
  readonly flagged: number;
  readonly unset: number;
}

export async function setClaimStatus(
  ctx: ScopedRepositoryContext,
  userId: number,
  status: ClaimStatus
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .update(users)
        .set({ claimStatus: status })
        .where(and(eq(users.id, userId), eq(users.schoolId, ctx.tenant.schoolId)));
    },
    "setClaimStatus"
  );
}

/**
 * One-time shared-digest reset (`04a §2`), scoped to the caller's school.
 * Accounts without an email cannot claim, so they are left untouched.
 */
export async function resetClaimDigests(
  ctx: ScopedRepositoryContext,
  digest: string
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(users)
      .set({ password: digest, claimStatus: "pending" })
      .where(
        and(
          eq(users.schoolId, ctx.tenant.schoolId),
          isNotNull(users.email),
          or(isNull(users.claimStatus), eq(users.claimStatus, "pending"))
        )
      )
      .returning({ id: users.id });
    return rows.length;
  }, "resetClaimDigests");
}

export async function countClaimStates(
  ctx: ScopedRepositoryContext
): Promise<ClaimStateCounts> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({ status: users.claimStatus, total: count() })
      .from(users)
      .where(eq(users.schoolId, ctx.tenant.schoolId))
      .groupBy(users.claimStatus);

    const counts: { pending: number; claimed: number; flagged: number; unset: number } = {
      pending: 0,
      claimed: 0,
      flagged: 0,
      unset: 0
    };
    for (const row of rows) {
      if (row.status === null) counts.unset = row.total;
      else counts[row.status] = row.total;
    }
    return counts;
  }, "countClaimStates");
}
