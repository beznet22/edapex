import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { smStudents, studentRecords } from "../../../db/schema";
import { batchOrThrow } from "../../base/d1-helpers";
import { withErrorHandling } from "../../base/error-handling";
import { requireAcademicId } from "../../base/repository-context";
import type { ScopedRepositoryContext } from "../../base/repository-context";

export interface StudentRecordLookup {
  readonly classId: number;
  readonly sectionId: number;
  readonly studentId: number;
}

export interface StudentRecordSummary {
  readonly id: number;
  readonly categoryId: number | null;
  readonly fullName: string | null;
  readonly admissionNo: number | null;
}

export interface StudentRecordByAdmission {
  readonly id: number;
  readonly userId: number | null;
  readonly recordId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly studentId: number | null;
  readonly isDefault: number | null;
  readonly fullName: string | null;
  readonly admissionNo: number | null;
  readonly parentId: number | null;
  readonly schoolId: number | null;
}

export interface AssignClassSectionParams {
  readonly studentId: number;
  readonly classId: number;
  readonly sectionId: number;
}

export async function createIfNotExistsStudentRecord(
  ctx: ScopedRepositoryContext,
  params: StudentRecordLookup
): Promise<number | null> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;

    const [existing] = await ctx.db
      .select({ id: studentRecords.id })
      .from(studentRecords)
      .where(
        and(
          eq(studentRecords.studentId, params.studentId),
          eq(studentRecords.classId, params.classId),
          eq(studentRecords.sectionId, params.sectionId),
          eq(studentRecords.isDefault, 1),
          eq(studentRecords.academicId, academicId),
          eq(studentRecords.activeStatus, 1),
          eq(studentRecords.schoolId, schoolId)
        )
      )
      .limit(1);
    if (existing !== undefined) return existing.id;

    const [inserted] = await ctx.db
      .insert(studentRecords)
      .values({
        studentId: params.studentId,
        classId: params.classId,
        sectionId: params.sectionId,
        isDefault: 1,
        academicId,
        schoolId,
        activeStatus: 1,
        status: "current"
      })
      .returning({ id: studentRecords.id });
    return inserted?.id ?? null;
  }, "createIfNotExistsStudentRecord");
}

export async function findStudentRecord(
  ctx: ScopedRepositoryContext,
  params: StudentRecordLookup
): Promise<StudentRecordSummary | null> {
  if (params.classId <= 0 || params.sectionId <= 0 || params.studentId <= 0) return null;
  return withErrorHandling(async () => {
    const [record] = await ctx.db
      .select({
        id: studentRecords.id,
        categoryId: smStudents.studentCategoryId,
        fullName: smStudents.fullName,
        admissionNo: smStudents.admissionNo
      })
      .from(studentRecords)
      .leftJoin(smStudents, eq(studentRecords.studentId, smStudents.id))
      .where(
        and(
          eq(studentRecords.studentId, params.studentId),
          eq(studentRecords.classId, params.classId),
          eq(studentRecords.sectionId, params.sectionId),
          eq(studentRecords.isDefault, 1),
          eq(studentRecords.academicId, requireAcademicId(ctx)),
          eq(studentRecords.activeStatus, 1),
          eq(studentRecords.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return record ?? null;
  }, "findStudentRecord");
}

export async function findStudentRecordByAdmissionNo(
  ctx: ScopedRepositoryContext,
  admissionNo: number
): Promise<StudentRecordByAdmission | null> {
  return withErrorHandling(async () => {
    const [record] = await ctx.db
      .select({
        id: smStudents.id,
        userId: smStudents.userId,
        recordId: studentRecords.id,
        classId: studentRecords.classId,
        sectionId: studentRecords.sectionId,
        studentId: studentRecords.studentId,
        isDefault: studentRecords.isDefault,
        fullName: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
        parentId: smStudents.parentId,
        schoolId: smStudents.schoolId
      })
      .from(smStudents)
      .leftJoin(
        studentRecords,
        and(
          eq(smStudents.id, studentRecords.studentId),
          eq(studentRecords.academicId, requireAcademicId(ctx)),
          eq(studentRecords.isDefault, 1),
          eq(studentRecords.activeStatus, 1)
        )
      )
      .where(
        and(
          eq(smStudents.admissionNo, admissionNo),
          eq(smStudents.activeStatus, 1),
          eq(smStudents.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return record ?? null;
  }, "findStudentRecordByAdmissionNo");
}

/**
 * Moves the student's default placement for the current academic year and
 * mirrors class/section on `sm_students`. The record upsert and the mirror
 * commit together.
 */
export async function assignClassSection(
  ctx: ScopedRepositoryContext,
  params: AssignClassSectionParams
): Promise<boolean> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;

    const [existing] = await ctx.db
      .select({ id: studentRecords.id })
      .from(studentRecords)
      .where(
        and(
          eq(studentRecords.studentId, params.studentId),
          eq(studentRecords.academicId, academicId),
          eq(studentRecords.schoolId, schoolId)
        )
      )
      .limit(1);

    const recordStatement: BatchItem<"sqlite"> =
      existing === undefined
        ? ctx.db.insert(studentRecords).values({
            studentId: params.studentId,
            classId: params.classId,
            sectionId: params.sectionId,
            academicId,
            schoolId,
            isDefault: 1,
            activeStatus: 1,
            status: "current"
          })
        : ctx.db
            .update(studentRecords)
            .set({
              classId: params.classId,
              sectionId: params.sectionId,
              isDefault: 1,
              activeStatus: 1,
              status: "current"
            })
            .where(eq(studentRecords.id, existing.id));

    const mirror = ctx.db
      .update(smStudents)
      .set({ classId: params.classId, sectionId: params.sectionId })
      .where(and(eq(smStudents.id, params.studentId), eq(smStudents.schoolId, schoolId)));

    await batchOrThrow(ctx.db, [recordStatement, mirror]);
    return true;
  }, "assignClassSection");
}
