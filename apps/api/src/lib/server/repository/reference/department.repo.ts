import { and, eq } from "drizzle-orm";

import { smHumanDepartments } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { ReferenceOption } from "./types";

export async function resolveDepartmentId(
  ctx: ScopedRepositoryContext,
  name: string
): Promise<number | null> {
  if (name.length === 0) return null;
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ id: smHumanDepartments.id })
      .from(smHumanDepartments)
      .where(
        and(
          eq(smHumanDepartments.activeStatus, 1),
          eq(smHumanDepartments.schoolId, ctx.tenant.schoolId),
          eq(smHumanDepartments.name, name)
        )
      )
      .limit(1);
    return row?.id ?? null;
  }, "resolveDepartmentId");
}

export async function listDepartments(
  ctx: ScopedRepositoryContext
): Promise<readonly ReferenceOption[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select({ id: smHumanDepartments.id, name: smHumanDepartments.name })
        .from(smHumanDepartments)
        .where(
          and(
            eq(smHumanDepartments.activeStatus, 1),
            eq(smHumanDepartments.schoolId, ctx.tenant.schoolId)
          )
        )
        .orderBy(smHumanDepartments.id),
    "listDepartments"
  );
}
