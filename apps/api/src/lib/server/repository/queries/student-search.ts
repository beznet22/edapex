import { and, eq } from "drizzle-orm";

import {
  smAssignSubjects,
  smParents,
  smStudents,
  studentRecords
} from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface StaffStudentRow {
  readonly id: number;
  readonly name: string | null;
  readonly admissionNo: number | null;
}

export interface SiblingRow {
  readonly studentId: number | null;
  readonly admissionNo: number | null;
  readonly fullName: string | null;
  readonly parentId: number | null;
  readonly guardiansName: string | null;
  readonly guardiansEmail: string | null;
}

/**
 * Students in the class-section of the staff member's first subject
 * assignment. Academics + students are separate aggregates; hence a query
 * module.
 */
export async function listStudentsByStaffId(
  ctx: ScopedRepositoryContext,
  staffId: number | undefined = ctx.tenant.staffId ?? undefined
): Promise<readonly StaffStudentRow[] | null> {
  if (staffId === undefined || staffId <= 0) return null;
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const [assignment] = await ctx.db
      .select({
        classId: smAssignSubjects.classId,
        sectionId: smAssignSubjects.sectionId
      })
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
    if (assignment?.classId === null || assignment?.classId === undefined) return null;
    if (assignment.sectionId === null) return null;

    return ctx.db
      .select({
        id: smStudents.id,
        name: smStudents.fullName,
        admissionNo: smStudents.admissionNo
      })
      .from(smStudents)
      .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
      .where(
        and(
          eq(studentRecords.classId, assignment.classId),
          eq(studentRecords.sectionId, assignment.sectionId),
          eq(studentRecords.academicId, academicId),
          eq(studentRecords.isDefault, 1),
          eq(studentRecords.schoolId, ctx.tenant.schoolId),
          eq(smStudents.activeStatus, 1),
          eq(smStudents.schoolId, ctx.tenant.schoolId)
        )
      )
      .groupBy(smStudents.id);
  }, "listStudentsByStaffId");
}

/** One row per parent with its (first) student, matching the legacy grouping. */
export async function listStudentsGroupedByParent(
  ctx: ScopedRepositoryContext
): Promise<readonly SiblingRow[]> {
  return withErrorHandling(async () => {
    return ctx.db
      .select({
        studentId: smStudents.id,
        admissionNo: smStudents.admissionNo,
        fullName: smStudents.fullName,
        parentId: smStudents.parentId,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail
      })
      .from(smParents)
      .leftJoin(
        smStudents,
        and(
          eq(smParents.id, smStudents.parentId),
          eq(smStudents.activeStatus, 1),
          eq(smStudents.schoolId, ctx.tenant.schoolId)
        )
      )
      .where(
        and(
          eq(smParents.activeStatus, 1),
          eq(smParents.schoolId, ctx.tenant.schoolId)
        )
      )
      .groupBy(smParents.id);
  }, "listStudentsGroupedByParent");
}
