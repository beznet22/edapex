import { and, eq, gt, inArray, isNull } from "drizzle-orm";

import { authMagicLinks, users } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { RepositoryContext } from "../base/repository-context";

export type MagicLinkRow = typeof authMagicLinks.$inferSelect;

export interface NewMagicLink {
  readonly id: string;
  readonly userId: number;
  readonly email: string;
  readonly tokenHash: string;
  readonly purpose: "signin" | "claim_link" | "claim_link_revoked";
  readonly subjectType?: "user" | "parent" | "staff" | null;
  readonly subjectId?: number | null;
  readonly schoolId?: number | null;
  readonly createdBy?: number | null;
  readonly expiresAt: number;
  readonly requestedIp: string | null;
  readonly createdAt: number;
}

export async function createMagicLink(
  ctx: RepositoryContext,
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
  ctx: RepositoryContext,
  tokenHash: string,
  now: number,
  purpose: "signin" | "claim_link" = "signin"
): Promise<MagicLinkRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .update(authMagicLinks)
      .set({ consumedAt: now })
      .where(
        and(
          eq(authMagicLinks.tokenHash, tokenHash),
          eq(authMagicLinks.purpose, purpose),
          isNull(authMagicLinks.consumedAt),
          gt(authMagicLinks.expiresAt, now)
        )
      )
      .returning();
    return row ?? null;
  }, "consumeMagicLink");
}

export async function findRecentMagicLink(
  ctx: RepositoryContext,
  email: string,
  since: number,
  now: number
): Promise<MagicLinkRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(authMagicLinks)
      .where(
        and(
          eq(authMagicLinks.email, email),
          eq(authMagicLinks.purpose, "signin"),
          isNull(authMagicLinks.consumedAt),
          gt(authMagicLinks.expiresAt, now),
          gt(authMagicLinks.createdAt, since)
        )
      )
      .orderBy(authMagicLinks.createdAt)
      .limit(1);
    return row ?? null;
  }, "findRecentMagicLink");
}

export async function findMagicLinkById(
  ctx: RepositoryContext,
  id: string
): Promise<MagicLinkRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(authMagicLinks)
      .where(eq(authMagicLinks.id, id))
      .limit(1);
    return row ?? null;
  }, "findMagicLinkById");
}

export async function revokeClaimLink(
  ctx: RepositoryContext,
  linkId: string,
  now: number
): Promise<boolean> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(authMagicLinks)
      .set({ purpose: "claim_link_revoked", consumedAt: now, revokedAt: now })
      .where(
        and(
          eq(authMagicLinks.id, linkId),
          eq(authMagicLinks.purpose, "claim_link")
        )
      )
      .returning({ id: authMagicLinks.id });
    return rows.length > 0;
  }, "revokeClaimLink");
}

export async function listClaimLinksBySchool(
  ctx: RepositoryContext,
  schoolId: number
): Promise<readonly MagicLinkRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(authMagicLinks)
        .where(
          and(
            eq(authMagicLinks.schoolId, schoolId),
            inArray(authMagicLinks.purpose, ["claim_link", "claim_link_revoked"])
          )
        )
        .orderBy(authMagicLinks.createdAt),
    "listClaimLinksBySchool"
  );
}

export async function setClaimLinkUser(
  ctx: RepositoryContext,
  linkId: string,
  userId: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .update(authMagicLinks)
        .set({ userId })
        .where(eq(authMagicLinks.id, linkId));
    },
    "setClaimLinkUser"
  );
}

export async function markEmailVerified(
  ctx: RepositoryContext,
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
