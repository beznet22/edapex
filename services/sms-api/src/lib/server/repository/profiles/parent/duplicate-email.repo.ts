import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { smParents, users } from "../../../db/schema";
import { batchOrThrow } from "../../base/d1-helpers";
import { withErrorHandling } from "../../base/error-handling";
import type { ScopedRepositoryContext } from "../../base/repository-context";

export interface ReassignEmailInput {
  readonly targetUserId: number;
  readonly otherUserIds: readonly number[];
  readonly email: string;
}

/**
 * `04a §5.2` reassign: the address moves to one account and is cleared on the
 * rest; both sides return to `pending`. Parent personas are mirrored in the
 * same batch (`01 §8` site 3 owns `users` + `sm_parents` together).
 */
export async function reassignEmail(
  ctx: ScopedRepositoryContext,
  input: ReassignEmailInput
): Promise<void> {
  await withErrorHandling(
    async () => {
      const statements: BatchItem<"sqlite">[] = [
        ctx.db
          .update(users)
          .set({ email: input.email, claimStatus: "pending" })
          .where(
            and(eq(users.id, input.targetUserId), eq(users.schoolId, ctx.tenant.schoolId))
          ),
        ctx.db
          .update(smParents)
          .set({ guardiansEmail: input.email })
          .where(
            and(
              eq(smParents.userId, input.targetUserId),
              eq(smParents.schoolId, ctx.tenant.schoolId)
            )
          )
      ];

      for (const otherId of input.otherUserIds) {
        statements.push(
          ctx.db
            .update(users)
            .set({ email: null, claimStatus: "pending" })
            .where(and(eq(users.id, otherId), eq(users.schoolId, ctx.tenant.schoolId)))
        );
        statements.push(
          ctx.db
            .update(smParents)
            .set({ guardiansEmail: null })
            .where(
              and(eq(smParents.userId, otherId), eq(smParents.schoolId, ctx.tenant.schoolId))
            )
        );
      }
      await batchOrThrow(ctx.db, statements);
    },
    "reassignEmail"
  );
}
