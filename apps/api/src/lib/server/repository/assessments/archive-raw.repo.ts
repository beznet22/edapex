import { and, count, eq, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import {
  smMarkStores,
  smResultStores,
  smStudents,
  studentRatings,
  teacherRemarks
} from "../../db/schema";
import { batchOrThrow, chunkedInsertIgnore, MAX_BATCH_STATEMENTS } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type RawMarkRow = typeof smMarkStores.$inferSelect;
export type RawResultRow = typeof smResultStores.$inferSelect;
export type RawRatingRow = typeof studentRatings.$inferSelect;
export type RawRemarkRow = typeof teacherRemarks.$inferSelect;

export interface AssessmentRawRows {
  readonly marks: readonly RawMarkRow[];
  readonly results: readonly RawResultRow[];
  readonly ratings: readonly RawRatingRow[];
  readonly remarks: readonly RawRemarkRow[];
}

export interface AssessmentRawCounts {
  readonly marks: number;
  readonly results: number;
  readonly ratings: number;
  readonly remarks: number;
}

/**
 * `student_ratings` and `teacher_remarks` carry no `school_id`; without this
 * guard a fabricated academic id could read another tenant's rows.
 */
const studentInSchool = (studentIdColumn: SQLiteColumn, schoolId: number) =>
  sql`exists (select 1 from ${smStudents} where ${smStudents.id} = ${studentIdColumn} and ${smStudents.schoolId} = ${schoolId})`;

export async function readAssessmentRawRows(
  ctx: ScopedRepositoryContext,
  params: { readonly studentId: number; readonly academicId: number }
): Promise<AssessmentRawRows> {
  return withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;
    const studentId = params.studentId;
    const academicId = params.academicId;

    const marks = await ctx.db
      .select()
      .from(smMarkStores)
      .where(
        and(
          eq(smMarkStores.schoolId, schoolId),
          eq(smMarkStores.academicId, academicId),
          eq(smMarkStores.studentId, studentId)
        )
      );
    const results = await ctx.db
      .select()
      .from(smResultStores)
      .where(
        and(
          eq(smResultStores.schoolId, schoolId),
          eq(smResultStores.academicId, academicId),
          eq(smResultStores.studentId, studentId)
        )
      );
    const ratings = await ctx.db
      .select()
      .from(studentRatings)
      .where(
        and(
          eq(studentRatings.academicId, academicId),
          eq(studentRatings.studentId, studentId),
          studentInSchool(studentRatings.studentId, schoolId)
        )
      );
    const remarks = await ctx.db
      .select()
      .from(teacherRemarks)
      .where(
        and(
          eq(teacherRemarks.academicId, academicId),
          eq(teacherRemarks.studentId, studentId),
          studentInSchool(teacherRemarks.studentId, schoolId)
        )
      );

    return { marks, results, ratings, remarks };
  }, "readAssessmentRawRows");
}

export async function countAssessmentRawRows(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<AssessmentRawCounts> {
  return withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;
    const [marks] = await ctx.db
      .select({ value: count() })
      .from(smMarkStores)
      .where(and(eq(smMarkStores.schoolId, schoolId), eq(smMarkStores.academicId, academicId)));
    const [results] = await ctx.db
      .select({ value: count() })
      .from(smResultStores)
      .where(
        and(eq(smResultStores.schoolId, schoolId), eq(smResultStores.academicId, academicId))
      );
    const [ratings] = await ctx.db
      .select({ value: count() })
      .from(studentRatings)
      .where(
        and(
          eq(studentRatings.academicId, academicId),
          studentInSchool(studentRatings.studentId, schoolId)
        )
      );
    const [remarks] = await ctx.db
      .select({ value: count() })
      .from(teacherRemarks)
      .where(
        and(
          eq(teacherRemarks.academicId, academicId),
          studentInSchool(teacherRemarks.studentId, schoolId)
        )
      );

    return {
      marks: Number(marks?.value ?? 0),
      results: Number(results?.value ?? 0),
      ratings: Number(ratings?.value ?? 0),
      remarks: Number(remarks?.value ?? 0)
    };
  }, "countAssessmentRawRows");
}

/** Counts first, then removes the session's marks/results/ratings/remarks. */
export async function purgeAssessmentRawRows(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<AssessmentRawCounts> {
  const counts = await countAssessmentRawRows(ctx, academicId);
  await withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;
    await batchOrThrow(ctx.db, [
      ctx.db
        .delete(smMarkStores)
        .where(and(eq(smMarkStores.schoolId, schoolId), eq(smMarkStores.academicId, academicId))),
      ctx.db
        .delete(smResultStores)
        .where(
          and(eq(smResultStores.schoolId, schoolId), eq(smResultStores.academicId, academicId))
        ),
      ctx.db
        .delete(studentRatings)
        .where(
          and(
            eq(studentRatings.academicId, academicId),
            studentInSchool(studentRatings.studentId, schoolId)
          )
        ),
      ctx.db
        .delete(teacherRemarks)
        .where(
          and(
            eq(teacherRemarks.academicId, academicId),
            studentInSchool(teacherRemarks.studentId, schoolId)
          )
        )
    ]);
  }, "purgeAssessmentRawRows");
  return counts;
}

/** Idempotent: re-running restore never duplicates rows. */
export async function restoreAssessmentRawRows(
  ctx: ScopedRepositoryContext,
  rows: AssessmentRawRows
): Promise<void> {
  await withErrorHandling(async () => {
    const statements = [
      ...chunkedInsertIgnore(ctx.db, smMarkStores, [...rows.marks], 1),
      ...chunkedInsertIgnore(ctx.db, smResultStores, [...rows.results], 1),
      ...chunkedInsertIgnore(ctx.db, studentRatings, [...rows.ratings], 1),
      ...chunkedInsertIgnore(ctx.db, teacherRemarks, [...rows.remarks], 1)
    ];
    for (let index = 0; index < statements.length; index += MAX_BATCH_STATEMENTS) {
      await batchOrThrow(ctx.db, statements.slice(index, index + MAX_BATCH_STATEMENTS));
    }
  }, "restoreAssessmentRawRows");
}

export async function countStudentAssessmentRows(
  ctx: ScopedRepositoryContext,
  params: { readonly studentId: number; readonly academicId: number }
): Promise<AssessmentRawCounts> {
  return withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;
    const studentId = params.studentId;
    const academicId = params.academicId;
    const [marks] = await ctx.db
      .select({ value: count() })
      .from(smMarkStores)
      .where(
        and(
          eq(smMarkStores.schoolId, schoolId),
          eq(smMarkStores.academicId, academicId),
          eq(smMarkStores.studentId, studentId)
        )
      );
    const [results] = await ctx.db
      .select({ value: count() })
      .from(smResultStores)
      .where(
        and(
          eq(smResultStores.schoolId, schoolId),
          eq(smResultStores.academicId, academicId),
          eq(smResultStores.studentId, studentId)
        )
      );
    const [ratings] = await ctx.db
      .select({ value: count() })
      .from(studentRatings)
      .where(
        and(
          eq(studentRatings.academicId, academicId),
          eq(studentRatings.studentId, studentId),
          studentInSchool(studentRatings.studentId, schoolId)
        )
      );
    const [remarks] = await ctx.db
      .select({ value: count() })
      .from(teacherRemarks)
      .where(
        and(
          eq(teacherRemarks.academicId, academicId),
          eq(teacherRemarks.studentId, studentId),
          studentInSchool(teacherRemarks.studentId, schoolId)
        )
      );
    return {
      marks: Number(marks?.value ?? 0),
      results: Number(results?.value ?? 0),
      ratings: Number(ratings?.value ?? 0),
      remarks: Number(remarks?.value ?? 0)
    };
  }, "countStudentAssessmentRows");
}
