import { eq } from "drizzle-orm";

import { smAcademicYears } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { AcademicYearRow, ScopedRepositoryContext } from "../base/repository-context";

export async function selectAcademicYears(
  ctx: ScopedRepositoryContext
): Promise<readonly AcademicYearRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(smAcademicYears)
        .where(eq(smAcademicYears.schoolId, ctx.tenant.schoolId))
        .orderBy(smAcademicYears.id),
    "selectAcademicYears"
  );
}

export async function selectAcademicYearById(
  ctx: ScopedRepositoryContext,
  id: number
): Promise<AcademicYearRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(smAcademicYears)
      .where(eq(smAcademicYears.id, id))
      .limit(1);
    if (row === undefined || row.schoolId !== ctx.tenant.schoolId) return null;
    return row;
  }, "selectAcademicYearById");
}
