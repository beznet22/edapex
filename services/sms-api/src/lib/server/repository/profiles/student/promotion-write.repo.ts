import { and, eq, sql } from "drizzle-orm";

import { smStudents, studentRecords } from "../../../db/schema";
import { withErrorHandling } from "../../base/error-handling";
import type { ScopedRepositoryContext } from "../../base/repository-context";

export async function createPromotionRecord(
  ctx: ScopedRepositoryContext,
  input: {
    readonly studentId: number;
    readonly sourceRecordId: number;
    readonly targetClassId: number | null;
    readonly targetSectionId: number | null;
    readonly targetAcademicId: number;
    readonly batchId: number;
    readonly rollNo: string | null;
    readonly actorId: number;
  }
): Promise<number> {
  return withErrorHandling(async () => {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db
      .update(studentRecords)
      .set({ isDefault: 0, updatedAt: now })
      .where(
        and(
          eq(studentRecords.studentId, input.studentId),
          eq(studentRecords.schoolId, ctx.tenant.schoolId)
        )
      );
    const [row] = await ctx.db
      .insert(studentRecords)
      .values({
        classId: input.targetClassId,
        sectionId: input.targetSectionId,
        rollNo: input.rollNo,
        isPromote: 1,
        isDefault: 1,
        schoolId: ctx.tenant.schoolId,
        academicId: input.targetAcademicId,
        studentId: input.studentId,
        activeStatus: 1,
        createdAt: now,
        updatedAt: now,
        isGraduate: 0,
        status: "current",
        promotedFromRecordId: input.sourceRecordId,
        promotionBatchId: input.batchId
      })
      .returning({ id: studentRecords.id });
    if (row === undefined) throw new Error("Insert into student_records returned no row");
    return row.id;
  }, "createPromotionRecord");
}

export async function updateStudentPlacement(
  ctx: ScopedRepositoryContext,
  input: {
    readonly studentId: number;
    readonly targetAcademicId: number;
    readonly targetClassId: number | null;
    readonly targetSectionId: number | null;
    readonly recordId: number;
  }
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(smStudents)
      .set({
        academicId: input.targetAcademicId,
        classId: input.targetClassId,
        sectionId: input.targetSectionId,
        currentRecordId: input.recordId,
        status: "active",
        updatedAt: Math.floor(Date.now() / 1000)
      })
      .where(
        and(
          eq(smStudents.id, input.studentId),
          eq(smStudents.schoolId, ctx.tenant.schoolId)
        )
      );
  }, "updateStudentPlacement");
}

export async function findRecordById(
  ctx: ScopedRepositoryContext,
  recordId: number
): Promise<{
  readonly id: number;
  readonly studentId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly academicId: number | null;
} | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        id: studentRecords.id,
        studentId: studentRecords.studentId,
        classId: studentRecords.classId,
        sectionId: studentRecords.sectionId,
        academicId: studentRecords.academicId
      })
      .from(studentRecords)
      .where(
        and(
          eq(studentRecords.id, recordId),
          eq(studentRecords.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findRecordById");
}

export async function deleteRecord(
  ctx: ScopedRepositoryContext,
  recordId: number
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .delete(studentRecords)
      .where(
        and(
          eq(studentRecords.id, recordId),
          eq(studentRecords.schoolId, ctx.tenant.schoolId)
        )
      );
  }, "deleteRecord");
}

export async function restorePlacement(
  ctx: ScopedRepositoryContext,
  input: {
    readonly studentId: number;
    readonly recordId: number;
    readonly classId: number | null;
    readonly sectionId: number | null;
    readonly academicId: number | null;
  }
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(smStudents)
      .set({
        academicId: input.academicId,
        classId: input.classId,
        sectionId: input.sectionId,
        currentRecordId: input.recordId,
        status: "active",
        updatedAt: Math.floor(Date.now() / 1000)
      })
      .where(
        and(
          eq(smStudents.id, input.studentId),
          eq(smStudents.schoolId, ctx.tenant.schoolId)
        )
      );
    await ctx.db
      .update(studentRecords)
      .set({ isDefault: 1, updatedAt: Math.floor(Date.now() / 1000) })
      .where(
        and(
          eq(studentRecords.id, input.recordId),
          eq(studentRecords.schoolId, ctx.tenant.schoolId)
        )
      );
  }, "restorePlacement");
}

export async function countTargetCurrentRecords(
  ctx: ScopedRepositoryContext,
  targetAcademicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const row = await ctx.db.get<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM student_records r
      WHERE r.school_id = ${ctx.tenant.schoolId} AND r.academic_id = ${targetAcademicId} AND r.is_default = 1
    `);
    return Number(row?.count ?? 0);
  }, "countTargetCurrentRecords");
}

export async function findPromotionRecord(
  ctx: ScopedRepositoryContext,
  input: {
    readonly studentId: number;
    readonly targetAcademicId: number;
    readonly sourceRecordId: number;
  }
): Promise<number | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ id: studentRecords.id })
      .from(studentRecords)
      .where(
        and(
          eq(studentRecords.studentId, input.studentId),
          eq(studentRecords.academicId, input.targetAcademicId),
          eq(studentRecords.promotedFromRecordId, input.sourceRecordId),
          eq(studentRecords.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row?.id ?? null;
  }, "findPromotionRecord");
}
