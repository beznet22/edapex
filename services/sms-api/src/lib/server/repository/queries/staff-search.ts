import { and, eq } from "drizzle-orm";

import { smAssignSubjects } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface StaffClassSectionRow {
  readonly id: number;
  readonly teacherId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly subjectId: number | null;
}

export interface ClassSectionQuery {
  readonly classId: number;
  readonly sectionId: number;
}

/** Subject assignments live in academics; staff lookup reads them explicitly. */
export async function findStaffByClassSection(
  ctx: ScopedRepositoryContext,
  params: ClassSectionQuery
): Promise<StaffClassSectionRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        id: smAssignSubjects.id,
        teacherId: smAssignSubjects.teacherId,
        classId: smAssignSubjects.classId,
        sectionId: smAssignSubjects.sectionId,
        subjectId: smAssignSubjects.subjectId
      })
      .from(smAssignSubjects)
      .where(
        and(
          eq(smAssignSubjects.classId, params.classId),
          eq(smAssignSubjects.sectionId, params.sectionId),
          eq(smAssignSubjects.activeStatus, 1),
          eq(smAssignSubjects.academicId, requireAcademicId(ctx)),
          eq(smAssignSubjects.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findStaffByClassSection");
}
