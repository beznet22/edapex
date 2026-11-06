import { and, eq } from "drizzle-orm";

import { authIdentities, smStaffs, users } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { UnscopedRepositoryContext } from "../base/repository-context";
import type { AuthIdentityRow, NewAuthIdentity, StaffRow } from "./types";

/**
 * Staff persona for a user id, resolved before a tenant exists. This is the
 * §6.3 pre-tenant path: it may span schools by design.
 */
export async function findStaffByUserId(
  ctx: UnscopedRepositoryContext,
  userId: number
): Promise<StaffRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(smStaffs)
      .where(eq(smStaffs.userId, userId))
      .limit(1);
    return row ?? null;
  }, "findStaffByUserId");
}

export async function findIdentity(
  ctx: UnscopedRepositoryContext,
  provider: string,
  providerUserId: string
): Promise<AuthIdentityRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, provider),
          eq(authIdentities.providerUserId, providerUserId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findIdentity");
}

export async function findIdentitiesByUserId(
  ctx: UnscopedRepositoryContext,
  userId: number
): Promise<readonly AuthIdentityRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(authIdentities)
        .where(eq(authIdentities.userId, userId))
        .orderBy(authIdentities.createdAt),
    "findIdentitiesByUserId"
  );
}

/** The id is supplied by the caller so linking can join an atomic batch. */
export async function linkIdentity(
  ctx: UnscopedRepositoryContext,
  identity: NewAuthIdentity
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.insert(authIdentities).values(identity);
    },
    "linkIdentity"
  );
}

/** Stores the shared claim digest (`04a §2`); password auth is retired. */
export async function updateUserClaimDigest(
  ctx: UnscopedRepositoryContext,
  userId: number,
  digest: string
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.update(users).set({ password: digest }).where(eq(users.id, userId));
    },
    "updateUserClaimDigest"
  );
}
