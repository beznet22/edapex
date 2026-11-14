import { and, eq } from "drizzle-orm";

import { smBaseGroups, smBaseSetups } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { ReferenceOption } from "./types";

const GENDER_GROUP = "Gender";

/** Resolves a gender setup by name within the tenant; the legacy lookup was global. */
export async function resolveGenderId(
  ctx: ScopedRepositoryContext,
  name: string
): Promise<number | null> {
  if (name.length === 0) return null;
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ id: smBaseSetups.id })
      .from(smBaseSetups)
      .innerJoin(smBaseGroups, eq(smBaseSetups.baseGroupId, smBaseGroups.id))
      .where(
        and(
          eq(smBaseGroups.name, GENDER_GROUP),
          eq(smBaseGroups.schoolId, ctx.tenant.schoolId),
          eq(smBaseSetups.schoolId, ctx.tenant.schoolId),
          eq(smBaseSetups.activeStatus, 1),
          eq(smBaseSetups.baseSetupName, name)
        )
      )
      .limit(1);
    return row?.id ?? null;
  }, "resolveGenderId");
}

export async function listGenders(
  ctx: ScopedRepositoryContext
): Promise<readonly ReferenceOption[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select({ id: smBaseSetups.id, name: smBaseSetups.baseSetupName })
        .from(smBaseSetups)
        .innerJoin(smBaseGroups, eq(smBaseSetups.baseGroupId, smBaseGroups.id))
        .where(
          and(
            eq(smBaseGroups.name, GENDER_GROUP),
            eq(smBaseGroups.schoolId, ctx.tenant.schoolId),
            eq(smBaseSetups.schoolId, ctx.tenant.schoolId),
            eq(smBaseSetups.activeStatus, 1)
          )
        )
        .orderBy(smBaseSetups.id),
    "listGenders"
  );
}
