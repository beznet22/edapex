import { and, eq } from "drizzle-orm";

import { infixRoles } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { UnscopedRepositoryContext } from "../base/repository-context";
import type { RoleRow } from "./types";

/** Role lookups are part of the pre-tenant login path, so they span schools. */
export async function findRoleById(
  ctx: UnscopedRepositoryContext,
  id: number
): Promise<RoleRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(infixRoles)
      .where(eq(infixRoles.id, id))
      .limit(1);
    return row ?? null;
  }, "findRoleById");
}

export async function listActiveRoles(
  ctx: UnscopedRepositoryContext,
  schoolId: number
): Promise<readonly RoleRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(infixRoles)
        .where(and(eq(infixRoles.schoolId, schoolId), eq(infixRoles.activeStatus, 1)))
        .orderBy(infixRoles.id),
    "listActiveRoles"
  );
}
