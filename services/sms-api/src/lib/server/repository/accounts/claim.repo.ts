import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { authIdentities, authSessions, users } from "../../db/schema";
import { batchOrThrow } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { UnscopedRepositoryContext } from "../base/repository-context";
import type { NewAuthIdentity, NewSession } from "./types";

export interface ClaimCompletionInput {
  readonly userId: number;
  readonly identity: NewAuthIdentity;
  readonly session: NewSession;
  readonly email: string;
  readonly now: number;
}

/**
 * Claim links an identity, retires the shared credential, and replaces every
 * session in one atomic batch (`04a §3`). The fresh session is inserted after
 * the delete so it survives the revocation.
 */
export async function completeClaimLink(
  ctx: UnscopedRepositoryContext,
  input: ClaimCompletionInput
): Promise<void> {
  await withErrorHandling(
    async () => {
      const statements: BatchItem<"sqlite">[] = [
        ctx.db.insert(authIdentities).values(input.identity),
        ctx.db
          .update(users)
          .set({
            email: input.email,
            password: null,
            claimStatus: "claimed",
            emailVerifiedAt: input.now
          })
          .where(eq(users.id, input.userId)),
        ctx.db.delete(authSessions).where(eq(authSessions.userId, input.userId)),
        ctx.db.insert(authSessions).values(input.session)
      ];
      await batchOrThrow(ctx.db, statements);
    },
    "completeClaimLink"
  );
}
