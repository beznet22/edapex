import { and, eq, like, or } from "drizzle-orm";

import { smParents, users } from "../../../db/schema";
import { batchOrThrow } from "../../base/d1-helpers";
import { DbEntityNotFoundError } from "../../base/errors";
import { withErrorHandling } from "../../base/error-handling";
import type { ScopedRepositoryContext } from "../../base/repository-context";

export interface ParentIdentity {
  readonly parentId: number;
  readonly guardiansName: string | null;
  readonly guardiansEmail: string | null;
  readonly userId: number | null;
}

export interface ParentSearchRow {
  readonly id: number;
  readonly guardiansName: string | null;
  readonly guardiansEmail: string | null;
  readonly fathersName: string | null;
  readonly mothersName: string | null;
}

const searchPattern = (query: string): string =>
  `%${query.trim().replace(/\s+/g, "%")}%`;

export async function findParentByEmail(
  ctx: ScopedRepositoryContext,
  email: string
): Promise<ParentIdentity | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        parentId: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        userId: smParents.userId
      })
      .from(smParents)
      .where(
        and(
          eq(smParents.guardiansEmail, email),
          eq(smParents.activeStatus, 1),
          eq(smParents.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findParentByEmail");
}

export async function searchParentsByName(
  ctx: ScopedRepositoryContext,
  query: string
): Promise<readonly ParentSearchRow[]> {
  return withErrorHandling(async () => {
    const pattern = searchPattern(query);
    return ctx.db
      .select({
        id: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        fathersName: smParents.fathersName,
        mothersName: smParents.mothersName
      })
      .from(smParents)
      .where(
        and(
          eq(smParents.activeStatus, 1),
          eq(smParents.schoolId, ctx.tenant.schoolId),
          or(
            like(smParents.guardiansName, pattern),
            like(smParents.fathersName, pattern),
            like(smParents.mothersName, pattern)
          )
        )
      )
      .limit(10);
  }, "searchParentsByName");
}

/**
 * Commits the guardian email and, when the parent already has a user row, that
 * user's email/username in one atomic batch (`01 §8` site 3). Creating a user
 * for a parent that has none is orchestration, owned by Phase 3.
 */
export async function updateParentEmail(
  ctx: ScopedRepositoryContext,
  parentId: number,
  newEmail: string
): Promise<boolean> {
  return withErrorHandling(async () => {
    const [parent] = await ctx.db
      .select({ userId: smParents.userId, schoolId: smParents.schoolId })
      .from(smParents)
      .where(eq(smParents.id, parentId))
      .limit(1);
    if (parent === undefined || parent.schoolId !== ctx.tenant.schoolId) {
      throw new DbEntityNotFoundError("Parent", parentId);
    }

    const guardianUpdate = ctx.db
      .update(smParents)
      .set({ guardiansEmail: newEmail })
      .where(and(eq(smParents.id, parentId), eq(smParents.schoolId, ctx.tenant.schoolId)));

    if (parent.userId === null) {
      await batchOrThrow(ctx.db, [guardianUpdate]);
      return true;
    }

    const userUpdate = ctx.db
      .update(users)
      .set({ email: newEmail, username: newEmail })
      .where(eq(users.id, parent.userId));
    await batchOrThrow(ctx.db, [guardianUpdate, userUpdate]);
    return true;
  }, "updateParentEmail");
}

/** Resolves the guardian behind the authenticated user for parent-scoped reads. */
export async function findParentByUserId(
  ctx: ScopedRepositoryContext,
  userId: number
): Promise<{ readonly parentId: number } | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ parentId: smParents.id })
      .from(smParents)
      .where(
        and(eq(smParents.userId, userId), eq(smParents.schoolId, ctx.tenant.schoolId))
      )
      .limit(1);
    return row ?? null;
  }, "findParentByUserId");
}
