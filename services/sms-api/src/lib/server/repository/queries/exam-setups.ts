import { and, desc, eq } from "drizzle-orm";

import { smAssignSubjects, smExamSetups, smExamTypes } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface ExamSetupSummary {
  readonly id: number;
  readonly examTitle: string | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly subjectId: number | null;
  readonly examId: number | null;
}

/**
 * Setups for the class-section of a staff member's first subject assignment.
 * Academics + assessments are separate aggregates, so this is a query module.
 */
export async function findExamSetupsByStaffId(
  ctx: ScopedRepositoryContext,
  staffId: number
): Promise<readonly ExamSetupSummary[]> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const [assignment] = await ctx.db
      .select({ classId: smAssignSubjects.classId, sectionId: smAssignSubjects.sectionId })
      .from(smAssignSubjects)
      .where(
        and(
          eq(smAssignSubjects.teacherId, staffId),
          eq(smAssignSubjects.academicId, academicId),
          eq(smAssignSubjects.activeStatus, 1),
          eq(smAssignSubjects.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    if (assignment?.classId === null || assignment?.classId === undefined) return [];
    if (assignment.sectionId === null) return [];

    const [term] = await ctx.db
      .select({ id: smExamTypes.id })
      .from(smExamTypes)
      .where(
        and(
          eq(smExamTypes.activeStatus, 1),
          eq(smExamTypes.academicId, academicId),
          eq(smExamTypes.schoolId, ctx.tenant.schoolId)
        )
      )
      .orderBy(desc(smExamTypes.sequence))
      .limit(1);
    if (term === undefined) return [];

    return ctx.db
      .select({
        id: smExamSetups.id,
        examTitle: smExamSetups.examTitle,
        classId: smExamSetups.classId,
        sectionId: smExamSetups.sectionId,
        subjectId: smExamSetups.subjectId,
        examId: smExamSetups.examId
      })
      .from(smExamSetups)
      .where(
        and(
          eq(smExamSetups.classId, assignment.classId),
          eq(smExamSetups.sectionId, assignment.sectionId),
          eq(smExamSetups.examTermId, term.id),
          eq(smExamSetups.academicId, academicId),
          eq(smExamSetups.schoolId, ctx.tenant.schoolId)
        )
      );
  }, "findExamSetupsByStaffId");
}
