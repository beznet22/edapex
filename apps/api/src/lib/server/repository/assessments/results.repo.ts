import { and, avg, eq, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { smExamSetups, smMarksGrades, smResultStores } from "../../db/schema";
import { batchOrThrow, chunkedInArray, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { ClassAverageRow, NewResult } from "./results-types";

export async function deleteResultStore(
  ctx: ScopedRepositoryContext,
  resultId: number,
  studentId: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .delete(smResultStores)
        .where(
          and(
            eq(smResultStores.id, resultId),
            eq(smResultStores.studentId, studentId),
            eq(smResultStores.schoolId, ctx.tenant.schoolId)
          )
        );
    },
    "deleteResultStore"
  );
}

export async function deleteExamSetup(
  ctx: ScopedRepositoryContext,
  setupIds: readonly number[]
): Promise<void> {
  await withErrorHandling(
    async () => {
      if (setupIds.length === 0) return;
      const statements = chunkedInArray(smExamSetups.id, setupIds).map((predicate) =>
        ctx.db
          .delete(smExamSetups)
          .where(and(predicate, eq(smExamSetups.schoolId, ctx.tenant.schoolId)))
      );
      await batchOrThrow(ctx.db, statements);
    },
    "deleteExamSetup"
  );
}

export async function getClassAverages(
  ctx: ScopedRepositoryContext,
  params: { readonly classId: number; readonly sectionId: number; readonly examId: number }
): Promise<readonly ClassAverageRow[]> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({
        studentId: smResultStores.studentId,
        average: avg(smResultStores.totalMarks).as("avg_marks")
      })
      .from(smResultStores)
      .where(
        and(
          eq(smResultStores.classId, params.classId),
          eq(smResultStores.sectionId, params.sectionId),
          eq(smResultStores.examTypeId, params.examId),
          eq(smResultStores.schoolId, ctx.tenant.schoolId),
          eq(smResultStores.academicId, requireAcademicId(ctx))
        )
      )
      .groupBy(smResultStores.studentId);
    return rows.map((row) => ({
      studentId: row.studentId,
      average: row.average === null ? null : Number(row.average)
    }));
  }, "getClassAverages");
}

/** Replaces the submitted result set atomically (delete then insert). */
export async function batchUpsertResultRecords(
  ctx: ScopedRepositoryContext,
  results: readonly NewResult[]
): Promise<void> {
  await withErrorHandling(
    async () => {
      if (results.length === 0) return;
      const recordIds = uniqueNumbers(results.map((result) => result.studentRecordId));
      const examTypeIds = uniqueNumbers(results.map((result) => result.examTypeId));

      const examPredicates = chunkedInArray(smResultStores.examTypeId, examTypeIds);
      const examFilter = examPredicates.length === 0 ? undefined : or(...examPredicates);
      const statements: BatchItem<"sqlite">[] = [];
      for (const predicate of chunkedInArray(smResultStores.studentRecordId, recordIds)) {
        statements.push(
          ctx.db
            .delete(smResultStores)
            .where(
              and(predicate, examFilter, eq(smResultStores.schoolId, ctx.tenant.schoolId))
            )
        );
      }
      statements.push(...chunkedInsert(ctx.db, smResultStores, results, 1));
      await batchOrThrow(ctx.db, statements);
    },
    "batchUpsertResultRecords"
  );
}

export interface MarkGradeRow {
  readonly gradeName: string;
  readonly gpa: number;
}

export async function getMarkGrade(
  ctx: ScopedRepositoryContext,
  percentage: number
): Promise<readonly MarkGradeRow[]> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({ gradeName: smMarksGrades.gradeName, gpa: smMarksGrades.gpa })
      .from(smMarksGrades)
      .where(
        and(
          eq(smMarksGrades.academicId, requireAcademicId(ctx)),
          eq(smMarksGrades.schoolId, ctx.tenant.schoolId),
          gtePercent(percentage)
        )
      );
    return rows.filter(
      (row): row is MarkGradeRow => row.gradeName !== null && row.gpa !== null
    );
  }, "getMarkGrade");
}

const gtePercent = (percentage: number) =>
  sql`${percentage} between ${smMarksGrades.percentFrom} and ${smMarksGrades.percentUpto}`;

const uniqueNumbers = (values: readonly (number | null | undefined)[]): number[] => {
  const set = new Set<number>();
  for (const value of values) {
    if (typeof value === "number") set.add(value);
  }
  return [...set];
};
