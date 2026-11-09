import { and, eq, gt, isNull } from "drizzle-orm";

import { authMagicLinks, users } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { UnscopedRepositoryContext } from "../base/repository-context";

export type MagicLinkRow = typeof authMagicLinks.$inferSelect;

export interface NewMagicLink {
  readonly id: string;
  readonly userId: number;
  readonly email: string;
  readonly tokenHash: string;
  readonly purpose: "signin";
  readonly expiresAt: number;
  readonly requestedIp: string | null;
  readonly createdAt: number;
}

export async function createMagicLink(
  ctx: UnscopedRepositoryContext,
  link: NewMagicLink
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.insert(authMagicLinks).values(link);
    },
    "createMagicLink"
  );
}

/**
 * Single-use consume. The conditional update is the atomicity boundary: two
 * concurrent verifications can never both receive the row.
 */
export async function consumeMagicLink(
  ctx: UnscopedRepositoryContext,
  tokenHash: string,
  now: number
): Promise<MagicLinkRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .update(authMagicLinks)
      .set({ consumedAt: now })
      .where(
        and(
          eq(authMagicLinks.tokenHash, tokenHash),
          isNull(authMagicLinks.consumedAt),
          gt(authMagicLinks.expiresAt, now)
        )
      )
      .returning();
    return row ?? null;
  }, "consumeMagicLink");
}

export async function markEmailVerified(
  ctx: UnscopedRepositoryContext,
  userId: number,
  verifiedAt: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .update(users)
        .set({ emailVerifiedAt: verifiedAt })
        .where(eq(users.id, userId));
    },
    "markEmailVerified"
  );
}
