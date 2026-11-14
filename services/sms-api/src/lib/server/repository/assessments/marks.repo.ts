import { and, eq, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { smExamSetups, smMarkStores, smResultStores, smSubjects } from "../../db/schema";
import { batchOrThrow, chunkedInArray, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { MarkWithSetup, NewMark } from "./results-types";

export async function deleteMarkStore(
  ctx: ScopedRepositoryContext,
  markIds: readonly number[],
  studentId: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      if (markIds.length === 0) return;
      const statements = chunkedInArray(smMarkStores.id, markIds).map((predicate) =>
        ctx.db
          .delete(smMarkStores)
          .where(
            and(
              predicate,
              eq(smMarkStores.studentId, studentId),
              eq(smMarkStores.schoolId, ctx.tenant.schoolId)
            )
          )
      );
      await batchOrThrow(ctx.db, statements);
    },
    "deleteMarkStore"
  );
}

export interface CleanMarksParams {
  readonly recordId: number;
  readonly studentId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly examTermId: number;
}

/**
 * Removes the student's marks and results for one term. Remarks, ratings and
 * attendance are other aggregates; Phase 3 orchestrates their cleanup.
 */
export async function cleanMarks(
  ctx: ScopedRepositoryContext,
  params: CleanMarksParams
): Promise<void> {
  await withErrorHandling(
    async () => {
      if (params.recordId === 0) return;
      const academicId = requireAcademicId(ctx);
      const schoolId = ctx.tenant.schoolId;

      const resultIds = await ctx.db
        .select({ id: smResultStores.id })
        .from(smResultStores)
        .where(
          and(
            eq(smResultStores.studentRecordId, params.recordId),
            eq(smResultStores.studentId, params.studentId),
            eq(smResultStores.classId, params.classId),
            eq(smResultStores.sectionId, params.sectionId),
            eq(smResultStores.examTypeId, params.examTermId),
            eq(smResultStores.schoolId, schoolId),
            eq(smResultStores.academicId, academicId)
          )
        );

      const markIds = await ctx.db
        .select({ id: smMarkStores.id })
        .from(smMarkStores)
        .where(
          and(
            eq(smMarkStores.studentRecordId, params.recordId),
            eq(smMarkStores.studentId, params.studentId),
            eq(smMarkStores.classId, params.classId),
            eq(smMarkStores.sectionId, params.sectionId),
            eq(smMarkStores.examTermId, params.examTermId),
            eq(smMarkStores.schoolId, schoolId),
            eq(smMarkStores.academicId, academicId)
          )
        );

      const statements: BatchItem<"sqlite">[] = [];
      for (const predicate of chunkedInArray(
        smResultStores.id,
        resultIds.map((row) => row.id)
      )) {
        statements.push(ctx.db.delete(smResultStores).where(predicate));
      }
      for (const predicate of chunkedInArray(
        smMarkStores.id,
        markIds.map((row) => row.id)
      )) {
        statements.push(ctx.db.delete(smMarkStores).where(predicate));
      }
      if (statements.length > 0) await batchOrThrow(ctx.db, statements);
    },
    "cleanMarks"
  );
}

/**
 * Replaces the submitted mark set atomically: delete the existing rows for the
 * involved records/setups, then insert the new set (`01 §8` site 5 analogue).
 */
export async function batchUpsertMarkRecords(
  ctx: ScopedRepositoryContext,
  marks: readonly NewMark[]
): Promise<void> {
  await withErrorHandling(
    async () => {
      if (marks.length === 0) return;
      const recordIds = uniqueNumbers(marks.map((mark) => mark.studentRecordId));
      const setupIds = uniqueNumbers(marks.map((mark) => mark.examSetupId));

      const statements: BatchItem<"sqlite">[] = [];
      const setupPredicates = chunkedInArray(smMarkStores.examSetupId, setupIds);
      const setupFilter =
        setupPredicates.length === 0 ? undefined : or(...setupPredicates);
      for (const predicate of chunkedInArray(smMarkStores.studentRecordId, recordIds)) {
        statements.push(
          ctx.db
            .delete(smMarkStores)
            .where(
              and(predicate, setupFilter, eq(smMarkStores.schoolId, ctx.tenant.schoolId))
            )
        );
      }
      statements.push(...chunkedInsert(ctx.db, smMarkStores, marks, 1));
      await batchOrThrow(ctx.db, statements);
    },
    "batchUpsertMarkRecords"
  );
}

export async function getMarksData(
  ctx: ScopedRepositoryContext,
  studentId: number,
  examId: number
): Promise<readonly MarkWithSetup[]> {
  return withErrorHandling(async () => {
    return ctx.db
      .select({
        studentId: smMarkStores.studentId,
        markId: smMarkStores.id,
        subjectId: smSubjects.id,
        totalMarks: smMarkStores.totalMarks,
        examTitle: smExamSetups.examTitle,
        examMark: smExamSetups.examMark,
        subjectCode: smSubjects.subjectCode,
        isAbsent: smMarkStores.isAbsent,
        subjectName: smSubjects.subjectName
      })
      .from(smMarkStores)
      .leftJoin(smSubjects, eq(smMarkStores.subjectId, smSubjects.id))
      .leftJoin(smExamSetups, eq(smMarkStores.examSetupId, smExamSetups.id))
      .where(
        and(
          eq(smMarkStores.studentId, studentId),
          eq(smMarkStores.examTermId, examId),
          eq(smMarkStores.activeStatus, 1),
          eq(smMarkStores.schoolId, ctx.tenant.schoolId)
        )
      );
  }, "getMarksData");
}

const uniqueNumbers = (values: readonly (number | null | undefined)[]): number[] => {
  const set = new Set<number>();
  for (const value of values) {
    if (typeof value === "number") set.add(value);
  }
  return [...set];
};
