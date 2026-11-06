import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { authIdentities, authSessions, users } from "../../db/schema";
import { batchOrThrow } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { ClaimStatus } from "./types";

export interface MergeAccountsInput {
  readonly keepUserId: number;
  readonly loserUserIds: readonly number[];
}

/**
 * `04a §5.2`: move identities and sessions, delete the loser, revoke every
 * session. The service refuses a loser that still owns a persona row, because
 * the persona FKs cascade on user delete.
 */
export async function mergeAccounts(
  ctx: ScopedRepositoryContext,
  input: MergeAccountsInput
): Promise<void> {
  if (input.loserUserIds.length === 0) return;
  await withErrorHandling(
    async () => {
      const statements: BatchItem<"sqlite">[] = [
        ctx.db
          .update(users)
          .set({ claimStatus: "pending" })
          .where(
            and(eq(users.id, input.keepUserId), eq(users.schoolId, ctx.tenant.schoolId))
          )
      ];

      for (const loserId of input.loserUserIds) {
        statements.push(
          ctx.db
            .update(authIdentities)
            .set({ userId: input.keepUserId })
            .where(eq(authIdentities.userId, loserId))
        );
      }
      statements.push(
        ctx.db.delete(authSessions).where(eq(authSessions.userId, input.keepUserId))
      );
      for (const loserId of input.loserUserIds) {
        statements.push(
          ctx.db.delete(authSessions).where(eq(authSessions.userId, loserId))
        );
        statements.push(ctx.db.delete(users).where(eq(users.id, loserId)));
      }
      await batchOrThrow(ctx.db, statements);
    },
    "mergeAccounts"
  );
}

export async function flagAccountForReview(
  ctx: ScopedRepositoryContext,
  userId: number,
  status: ClaimStatus = "flagged"
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .update(users)
        .set({ claimStatus: status })
        .where(and(eq(users.id, userId), eq(users.schoolId, ctx.tenant.schoolId)));
    },
    "flagAccountForReview"
  );
}
