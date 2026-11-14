import { and, eq, isNull } from "drizzle-orm";

import { publicDocumentTokens } from "../../db/schema";
import { DbEntityNotFoundError } from "../base/errors";
import { withErrorHandling } from "../base/error-handling";
import type { RepositoryContext, ScopedRepositoryContext } from "../base/repository-context";

export type PublicTokenRow = typeof publicDocumentTokens.$inferSelect;
export type NewPublicToken = typeof publicDocumentTokens.$inferInsert;

export async function insertPublicToken(
  ctx: ScopedRepositoryContext,
  row: NewPublicToken
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db.insert(publicDocumentTokens).values(row);
  }, "insertPublicToken");
}

/**
 * The one intentionally unscoped read: `/r/:token` verifies the HMAC first and
 * only then learns the school. The `jti` is a 128-bit random value with a
 * unique index, so it cannot collide across tenants.
 */
export async function findPublicTokenByJtiUnscoped(
  ctx: RepositoryContext,
  jti: string
): Promise<PublicTokenRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(publicDocumentTokens)
      .where(eq(publicDocumentTokens.jti, jti))
      .limit(1);
    return row ?? null;
  }, "findPublicTokenByJtiUnscoped");
}

export async function findPublicTokenById(
  ctx: ScopedRepositoryContext,
  id: number
): Promise<PublicTokenRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(publicDocumentTokens)
      .where(
        and(
          eq(publicDocumentTokens.id, id),
          eq(publicDocumentTokens.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findPublicTokenById");
}

export async function revokePublicToken(
  ctx: ScopedRepositoryContext,
  params: { readonly id: number; readonly revokedBy: number; readonly revokedAt: number }
): Promise<void> {
  await withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ id: publicDocumentTokens.id, revokedAt: publicDocumentTokens.revokedAt })
      .from(publicDocumentTokens)
      .where(
        and(
          eq(publicDocumentTokens.id, params.id),
          eq(publicDocumentTokens.schoolId, ctx.tenant.schoolId),
          isNull(publicDocumentTokens.revokedAt)
        )
      )
      .limit(1);
    if (row === undefined) {
      const existing = await findPublicTokenById(ctx, params.id);
      if (existing === null) throw new DbEntityNotFoundError("Public token", params.id);
      return;
    }
    await ctx.db
      .update(publicDocumentTokens)
      .set({ revokedAt: params.revokedAt, revokedBy: params.revokedBy })
      .where(
        and(
          eq(publicDocumentTokens.id, params.id),
          eq(publicDocumentTokens.schoolId, ctx.tenant.schoolId)
        )
      );
  }, "revokePublicToken");
}
