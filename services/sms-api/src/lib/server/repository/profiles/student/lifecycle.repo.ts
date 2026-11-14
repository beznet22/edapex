import { and, desc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import {
  smStudentPromotions,
  smStudents,
  studentRecords
} from "../../../db/schema";
import { batchOrThrow } from "../../base/d1-helpers";
import { DbInternalError } from "../../base/errors";
import { withErrorHandling } from "../../base/error-handling";
import { requireAcademicId } from "../../base/repository-context";
import type { ScopedRepositoryContext } from "../../base/repository-context";
import type {
  DemoteParams,
  DemoteResult,
  PromoteParams,
  PromoteResult,
  PromotionRow
} from "./types";

export async function findLatestPromotion(
  ctx: ScopedRepositoryContext,
  studentId: number
): Promise<PromotionRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(smStudentPromotions)
      .where(
        and(
          eq(smStudentPromotions.studentId, studentId),
          eq(smStudentPromotions.schoolId, ctx.tenant.schoolId)
        )
      )
      .orderBy(desc(smStudentPromotions.id))
      .limit(1);
    return row ?? null;
  }, "findLatestPromotion");
}

export async function findNextRollNo(
  ctx: ScopedRepositoryContext,
  classId: number,
  sectionId: number,
  academicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const [last] = await ctx.db
      .select({ rollNo: smStudents.rollNo })
      .from(smStudents)
      .where(
        and(
          eq(smStudents.classId, classId),
          eq(smStudents.sectionId, sectionId),
          eq(smStudents.academicId, academicId),
          eq(smStudents.schoolId, ctx.tenant.schoolId)
        )
      )
      .orderBy(desc(smStudents.rollNo))
      .limit(1);
    return (last?.rollNo ?? 0) + 1;
  }, "findNextRollNo");
}

/**
 * Reverts a promotion (`01 §8` site 1). Current and previous records are read
 * first; the four writes are then one atomic batch, with no mid-flight read.
 */
export async function demoteStudent(
  ctx: ScopedRepositoryContext,
  params: DemoteParams
): Promise<DemoteResult> {
  return withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;

    const [currentRecord] = await ctx.db
      .select({ id: studentRecords.id })
      .from(studentRecords)
      .where(
        and(
          eq(studentRecords.studentId, params.studentId),
          eq(studentRecords.classId, params.currentClassId),
          eq(studentRecords.sectionId, params.currentSectionId),
          eq(studentRecords.academicId, params.currentAcademicId),
          eq(studentRecords.isDefault, 1),
          eq(studentRecords.schoolId, schoolId)
        )
      )
      .limit(1);

    const [previousRecord] = await ctx.db
      .select({ id: studentRecords.id })
      .from(studentRecords)
      .where(
        and(
          eq(studentRecords.studentId, params.studentId),
          eq(studentRecords.classId, params.previousClassId),
          eq(studentRecords.sectionId, params.previousSectionId),
          eq(studentRecords.academicId, params.previousAcademicId),
          eq(studentRecords.schoolId, schoolId)
        )
      )
      .limit(1);

    const statements: BatchItem<"sqlite">[] = [];
    if (currentRecord !== undefined) {
      statements.push(
        ctx.db
          .update(studentRecords)
          .set({ isDefault: 0, activeStatus: 0, status: "promoted" })
          .where(eq(studentRecords.id, currentRecord.id))
      );
    }
    if (previousRecord !== undefined) {
      statements.push(
        ctx.db
          .update(studentRecords)
          .set({ isDefault: 1, isPromote: 0, activeStatus: 1, status: "current" })
          .where(eq(studentRecords.id, previousRecord.id))
      );
    }
    statements.push(
      ctx.db
        .update(smStudents)
        .set({
          classId: params.previousClassId,
          sectionId: params.previousSectionId,
          academicId: params.previousAcademicId,
          rollNo: params.previousRollNumber,
          ...(previousRecord === undefined
            ? {}
            : { currentRecordId: previousRecord.id })
        })
        .where(and(eq(smStudents.id, params.studentId), eq(smStudents.schoolId, schoolId)))
    );
    statements.push(
      ctx.db
        .delete(smStudentPromotions)
        .where(
          and(
            eq(smStudentPromotions.id, params.promotionId),
            eq(smStudentPromotions.schoolId, schoolId)
          )
        )
    );

    await batchOrThrow(ctx.db, statements);
    return {
      success: true,
      studentId: params.studentId,
      previousClassId: params.previousClassId,
      previousSectionId: params.previousSectionId,
      previousAcademicId: params.previousAcademicId
    };
  }, "demoteStudent");
}

/**
 * Data half of promotion: audit row, old-record deactivation, new record and
 * the student mirror. Fees assignment and chat-group migration are service
 * orchestration (`R2`) and run after this returns.
 */
export async function promoteStudent(
  ctx: ScopedRepositoryContext,
  params: PromoteParams
): Promise<PromoteResult> {
  return withErrorHandling(async () => {
    const currentAcademicId = requireAcademicId(ctx);
    const targetAcademicId = params.targetAcademicId ?? currentAcademicId;
    const schoolId = ctx.tenant.schoolId;

    const [student] = await ctx.db
      .select()
      .from(smStudents)
      .where(and(eq(smStudents.id, params.studentId), eq(smStudents.schoolId, schoolId)))
      .limit(1);
    if (student === undefined) {
      throw new DbInternalError(`Student with id '${params.studentId}' not found`);
    }

    const [currentRecord] = await ctx.db
      .select({ id: studentRecords.id })
      .from(studentRecords)
      .where(
        and(
          eq(studentRecords.studentId, params.studentId),
          eq(studentRecords.isDefault, 1),
          eq(studentRecords.academicId, currentAcademicId),
          eq(studentRecords.schoolId, schoolId)
        )
      )
      .limit(1);

    const finalRollNo =
      params.rollNo ?? (await findNextRollNo(ctx, params.classId, params.sectionId, targetAcademicId));

    const now = Math.floor(Date.now() / 1000);
    const [promotion] = await ctx.db
      .insert(smStudentPromotions)
      .values({
        studentId: params.studentId,
        previousClassId: student.classId,
        previousSectionId: student.sectionId,
        previousSessionId: currentAcademicId,
        currentClassId: params.classId,
        currentSectionId: params.sectionId,
        currentSessionId: targetAcademicId,
        previousRollNumber: student.rollNo,
        currentRollNumber: finalRollNo,
        resultStatus: params.resultStatus ?? "PASSED",
        studentInfo: JSON.stringify(student),
        admissionNumber: student.admissionNo,
        schoolId,
        academicId: currentAcademicId,
        createdAt: now,
        updatedAt: now
      })
      .returning({ id: smStudentPromotions.id });
    if (promotion === undefined) {
      throw new DbInternalError("Insert into sm_student_promotions returned no id");
    }

    const [newRecord] = await ctx.db
      .insert(studentRecords)
      .values({
        studentId: params.studentId,
        classId: params.classId,
        sectionId: params.sectionId,
        academicId: targetAcademicId,
        schoolId,
        isDefault: 1,
        isPromote: 0,
        activeStatus: 1,
        status: "current"
      })
      .returning({ id: studentRecords.id });
    if (newRecord === undefined) {
      throw new DbInternalError("Insert into student_records returned no id");
    }

    try {
      const statements: BatchItem<"sqlite">[] = [];
      if (currentRecord !== undefined) {
        statements.push(
          ctx.db
            .update(studentRecords)
            .set({ isDefault: 0, isPromote: 1, activeStatus: 0, status: "promoted" })
            .where(eq(studentRecords.id, currentRecord.id))
        );
      }
      statements.push(
        ctx.db
          .update(smStudents)
          .set({
            classId: params.classId,
            sectionId: params.sectionId,
            academicId: targetAcademicId,
            rollNo: finalRollNo,
            currentRecordId: newRecord.id
          })
          .where(and(eq(smStudents.id, params.studentId), eq(smStudents.schoolId, schoolId)))
      );
      await batchOrThrow(ctx.db, statements);
    } catch (error) {
      await ctx.db.delete(studentRecords).where(eq(studentRecords.id, newRecord.id));
      await ctx.db.delete(smStudentPromotions).where(eq(smStudentPromotions.id, promotion.id));
      throw error;
    }

    return {
      success: true,
      studentId: params.studentId,
      promotionId: promotion.id,
      recordId: newRecord.id,
      rollNo: finalRollNo
    };
  }, "promoteStudent");
}
