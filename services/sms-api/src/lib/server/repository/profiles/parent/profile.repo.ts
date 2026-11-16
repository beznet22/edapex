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

/**
 * A guardian record, before it has an account.
 *
 * `userId` is deliberately absent from this input. The column defaults to `1` and
 * foreign-keys to `users`, which is a legacy shape meaning "some user" — writing it would
 * attach every new guardian to whichever account happens to be id 1. `createParent` sets it
 * to null and account linking stays a separate, explicit act.
 */
export interface NewParentInput {
  readonly guardiansName: string;
  readonly guardiansEmail: string | null;
  readonly guardiansMobile: string | null;
  readonly guardiansRelation: string | null;
  readonly guardiansAddress?: string | null;
  readonly fathersName?: string | null;
  readonly mothersName?: string | null;
  readonly academicId?: number | null;
}

/**
 * Creates a guardian row.
 *
 * Callers must resolve an existing guardian by email first — `findParentByEmail` exists for
 * that. Two siblings sharing a guardian is one row and two links, never two rows: the
 * legacy system produced duplicates this way, and the migration still carries repair steps
 * for it (`transform/people.mjs` D1/F1).
 */
export async function createParent(
  ctx: ScopedRepositoryContext,
  input: NewParentInput
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .insert(smParents)
      .values({
        guardiansName: input.guardiansName.trim(),
        guardiansEmail: input.guardiansEmail,
        guardiansMobile: input.guardiansMobile,
        guardiansRelation: input.guardiansRelation,
        guardiansAddress: input.guardiansAddress ?? null,
        fathersName: input.fathersName ?? null,
        mothersName: input.mothersName ?? null,
        isGuardian: 1,
        activeStatus: 1,
        userId: null,
        schoolId: ctx.tenant.schoolId,
        ...(input.academicId === undefined || input.academicId === null
          ? {}
          : { academicId: input.academicId })
      })
      .returning({ id: smParents.id });
    const [row] = rows;
    if (row === undefined) throw new DbEntityNotFoundError("Parent", "new");
    return row.id;
  }, "createParent");
}

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
