import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import {
  smMarkStores,
  studentRatings,
  teacherRemarks
} from "../../db/schema";
import { batchOrThrow, chunkedInsert } from "../base/d1-helpers";
import { DbInternalError } from "../base/errors";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type NewStudentRating = typeof studentRatings.$inferInsert;
export type NewTeacherRemark = typeof teacherRemarks.$inferInsert;
export type NewDaycareOutcome = typeof smMarkStores.$inferInsert;

export interface StudentRatingView {
  readonly attribute: string | null;
  readonly rate: number | null;
  readonly color: string | null;
  readonly remark: string | null;
}

export interface TeacherRemarkView {
  readonly remark: string | null;
}
export interface RatingFilters {
  readonly studentId?: number;
  readonly examTypeId?: number;
}

export interface RemarkFilters extends RatingFilters {
  readonly teacherId?: number;
}

export async function findStudentRatings(
  ctx: ScopedRepositoryContext,
  filters: RatingFilters
): Promise<readonly StudentRatingView[]> {
  return withErrorHandling(async () => {
    const conditions = [
      eq(studentRatings.academicId, requireAcademicId(ctx)),
      ...(filters.studentId === undefined
        ? []
        : [eq(studentRatings.studentId, filters.studentId)]),
      ...(filters.examTypeId === undefined
        ? []
        : [eq(studentRatings.examTypeId, filters.examTypeId)])
    ];
    return ctx.db
      .select({
        attribute: studentRatings.attribute,
        rate: studentRatings.rate,
        color: studentRatings.color,
        remark: studentRatings.remark
      })
      .from(studentRatings)
      .where(and(...conditions));
  }, "findStudentRatings");
}

export async function findTeacherRemarks(
  ctx: ScopedRepositoryContext,
  filters: RemarkFilters
): Promise<readonly TeacherRemarkView[]> {
  return withErrorHandling(async () => {
    const conditions = [
      eq(teacherRemarks.academicId, requireAcademicId(ctx)),
      ...(filters.studentId === undefined
        ? []
        : [eq(teacherRemarks.studentId, filters.studentId)]),
      ...(filters.examTypeId === undefined
        ? []
        : [eq(teacherRemarks.examTypeId, filters.examTypeId)]),
      ...(filters.teacherId === undefined
        ? []
        : [eq(teacherRemarks.teacherId, filters.teacherId)])
    ];
    return ctx.db
      .select({ remark: teacherRemarks.remark })
      .from(teacherRemarks)
      .where(and(...conditions));
  }, "findTeacherRemarks");
}

/** Updates the mark-store remark or inserts the outcome row. */
export async function upsertDaycareLearningOutcome(
  ctx: ScopedRepositoryContext,
  outcome: NewDaycareOutcome
): Promise<number | null> {
  return withErrorHandling(async () => {
    if (
      outcome.studentId === null ||
      outcome.studentId === undefined ||
      outcome.subjectId === null ||
      outcome.subjectId === undefined ||
      outcome.classId === null ||
      outcome.classId === undefined ||
      outcome.sectionId === null ||
      outcome.sectionId === undefined ||
      outcome.examTermId === null ||
      outcome.examTermId === undefined
    ) {
      return null;
    }

    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;
    const [existing] = await ctx.db
      .select({ id: smMarkStores.id })
      .from(smMarkStores)
      .where(
        and(
          eq(smMarkStores.studentId, outcome.studentId),
          eq(smMarkStores.subjectId, outcome.subjectId),
          eq(smMarkStores.classId, outcome.classId),
          eq(smMarkStores.sectionId, outcome.sectionId),
          eq(smMarkStores.examTermId, outcome.examTermId),
          eq(smMarkStores.academicId, academicId),
          eq(smMarkStores.schoolId, schoolId)
        )
      )
      .limit(1);

    if (existing !== undefined) {
      await ctx.db
        .update(smMarkStores)
        .set({ teacherRemarks: outcome.teacherRemarks })
        .where(eq(smMarkStores.id, existing.id));
      return existing.id;
    }

    const [inserted] = await ctx.db
      .insert(smMarkStores)
      .values({ ...outcome, academicId, schoolId })
      .returning({ id: smMarkStores.id });
    if (inserted === undefined) {
      throw new DbInternalError("Insert into sm_mark_stores returned no id");
    }
    return inserted.id;
  }, "upsertDaycareLearningOutcome");
}

/** Upserts on (student, term, attribute); one statement per rating. */
export async function upsertStudentRatings(
  ctx: ScopedRepositoryContext,
  ratings: readonly NewStudentRating[]
): Promise<void> {
  await withErrorHandling(
    async () => {
      if (ratings.length === 0) return;
      const academicId = requireAcademicId(ctx);
      const statements: BatchItem<"sqlite">[] = ratings.map((rating) =>
        ctx.db
          .insert(studentRatings)
          .values({ ...rating, academicId })
          .onConflictDoUpdate({
            target: [
              studentRatings.studentId,
              studentRatings.examTypeId,
              studentRatings.attribute
            ],
            set: {
              rate: rating.rate,
              color: rating.color,
              remark: rating.remark,
              updatedAt: Math.floor(Date.now() / 1000)
            }
          })
      );
      await batchOrThrow(ctx.db, statements);
    },
    "upsertStudentRatings"
  );
}

/** Upserts on (student, term, academic year). */
export async function upsertTeacherRemark(
  ctx: ScopedRepositoryContext,
  remark: NewTeacherRemark
): Promise<void> {
  await withErrorHandling(
    async () => {
      const academicId = requireAcademicId(ctx);
      await ctx.db
        .insert(teacherRemarks)
        .values({ ...remark, academicId })
        .onConflictDoUpdate({
          target: [teacherRemarks.studentId, teacherRemarks.examTypeId, teacherRemarks.academicId],
          set: {
            remark: remark.remark,
            teacherId: remark.teacherId,
            updatedAt: Math.floor(Date.now() / 1000)
          }
        });
    },
    "upsertTeacherRemark"
  );
}

/** Insert helper retained for bulk daycare rows with known keys. */
export async function insertOutcomes(
  ctx: ScopedRepositoryContext,
  outcomes: readonly NewDaycareOutcome[]
): Promise<void> {
  await withErrorHandling(
    async () => {
      if (outcomes.length === 0) return;
      const academicId = requireAcademicId(ctx);
      const schoolId = ctx.tenant.schoolId;
      await batchOrThrow(
        ctx.db,
        chunkedInsert(
          ctx.db,
          smMarkStores,
          outcomes.map((outcome) => ({ ...outcome, academicId, schoolId })),
          1
        )
      );
    },
    "insertOutcomes"
  );
}
