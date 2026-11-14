import { and, eq } from "drizzle-orm";

import {
  smBaseSetups,
  smClasses,
  smParents,
  smSections,
  smStudentCategories,
  smStudents,
  studentRecords
} from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface StudentDetails {
  readonly studentId: number;
  readonly admissionNo: number | null;
  readonly fullName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly studentPhoto: string | null;
  readonly dateOfBirth: string | null;
  readonly genderName: string | null;
  readonly categoryName: string | null;
  readonly parentId: number | null;
  readonly guardiansName: string | null;
  readonly guardiansMobile: string | null;
  readonly guardiansEmail: string | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly studentRecordId: number | null;
  readonly schoolId: number | null;
  readonly academicId: number | null;
  readonly genderId: number | null;
  readonly studentCategoryId: number | null;
  readonly rollNo: number | null;
  readonly userId: number | null;
}

/**
 * Full student view joined to parents, reference dictionaries and the current
 * placement record. It spans the student and parent aggregates, so it is a
 * read-only query module (`R9`).
 */
export async function findStudentDetails(
  ctx: ScopedRepositoryContext,
  id: number,
  byAdmissionNumber = false
): Promise<StudentDetails | null> {
  if (id <= 0) return null;
  return withErrorHandling(async () => {
    const [student] = await ctx.db
      .select({
        studentId: smStudents.id,
        admissionNo: smStudents.admissionNo,
        fullName: smStudents.fullName,
        firstName: smStudents.firstName,
        lastName: smStudents.lastName,
        email: smParents.guardiansEmail,
        mobile: smParents.guardiansMobile,
        studentPhoto: smStudents.studentPhoto,
        dateOfBirth: smStudents.dateOfBirth,
        genderName: smBaseSetups.baseSetupName,
        categoryName: smStudentCategories.categoryName,
        parentId: smStudents.parentId,
        guardiansName: smParents.guardiansName,
        guardiansMobile: smParents.guardiansMobile,
        guardiansEmail: smParents.guardiansEmail,
        classId: studentRecords.classId,
        sectionId: studentRecords.sectionId,
        className: smClasses.className,
        sectionName: smSections.sectionName,
        studentRecordId: studentRecords.id,
        schoolId: studentRecords.schoolId,
        academicId: studentRecords.academicId,
        genderId: smStudents.genderId,
        studentCategoryId: smStudents.studentCategoryId,
        rollNo: smStudents.rollNo,
        userId: smStudents.userId
      })
      .from(smStudents)
      .leftJoin(smBaseSetups, eq(smStudents.genderId, smBaseSetups.id))
      .leftJoin(smParents, eq(smStudents.parentId, smParents.id))
      .leftJoin(smStudentCategories, eq(smStudents.studentCategoryId, smStudentCategories.id))
      .leftJoin(
        studentRecords,
        and(
          eq(smStudents.id, studentRecords.studentId),
          eq(studentRecords.academicId, requireAcademicId(ctx)),
          eq(studentRecords.activeStatus, 1),
          eq(studentRecords.isDefault, 1)
        )
      )
      .leftJoin(smClasses, eq(studentRecords.classId, smClasses.id))
      .leftJoin(smSections, eq(studentRecords.sectionId, smSections.id))
      .where(
        and(
          eq(
            byAdmissionNumber ? smStudents.admissionNo : smStudents.id,
            id
          ),
          eq(smStudents.activeStatus, 1),
          eq(smStudents.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return student ?? null;
  }, "findStudentDetails");
}
