import { and, eq } from "drizzle-orm";

import { smAssignClassTeachers, smAssignSubjects, smClassTeachers, smSubjects } from "../../db/schema";
import { batchOrThrow, chunkedInsert } from "../base/d1-helpers";
import { DbInternalError } from "../base/errors";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type AssignSubjectRow = typeof smAssignSubjects.$inferInsert;

export interface AssignClassTeacherParams {
  readonly classId: number;
  readonly sectionId: number;
  readonly staffId: number;
}

export interface AssignSubjectTeacherParams {
  readonly classId: number;
  readonly sectionId: number;
  readonly subjectId: number;
  readonly staffId: number;
}

export interface AssignedSubjectRow {
  readonly subjectId: number;
  readonly subjectCode: string | null;
  readonly teacherId: number | null;
}

export interface AssignClassTeacherResult {
  readonly assignClassTeacherId: number;
}

/**
 * Finds or creates the class-teacher header, then replaces the active slot.
 * The header insert returns its id, so it stays outside the batch; the slot
 * deactivate/insert pair is atomic.
 */
export async function assignClassTeacher(
  ctx: ScopedRepositoryContext,
  params: AssignClassTeacherParams
): Promise<AssignClassTeacherResult> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;

    const [existingHeader] = await ctx.db
      .select({ id: smAssignClassTeachers.id })
      .from(smAssignClassTeachers)
      .where(
        and(
          eq(smAssignClassTeachers.schoolId, schoolId),
          eq(smAssignClassTeachers.classId, params.classId),
          eq(smAssignClassTeachers.sectionId, params.sectionId),
          eq(smAssignClassTeachers.academicId, academicId)
        )
      )
      .limit(1);

    let headerId = existingHeader?.id;
    if (headerId === undefined) {
      const [inserted] = await ctx.db
        .insert(smAssignClassTeachers)
        .values({
          schoolId,
          classId: params.classId,
          sectionId: params.sectionId,
          academicId,
          activeStatus: 1,
          ...(ctx.tenant.userId === null ? {} : { createdBy: ctx.tenant.userId })
        })
        .returning({ id: smAssignClassTeachers.id });
      if (inserted === undefined) {
        throw new DbInternalError("Insert into sm_assign_class_teachers returned no id");
      }
      headerId = inserted.id;
    }

    const [currentSlot] = await ctx.db
      .select({ id: smClassTeachers.id, teacherId: smClassTeachers.teacherId })
      .from(smClassTeachers)
      .where(
        and(
          eq(smClassTeachers.assignClassTeacherId, headerId),
          eq(smClassTeachers.activeStatus, 1)
        )
      )
      .limit(1);

    if (currentSlot !== undefined && currentSlot.teacherId === params.staffId) {
      return { assignClassTeacherId: headerId };
    }

    const deactivate =
      currentSlot === undefined
        ? []
        : [
            ctx.db
              .update(smClassTeachers)
              .set({ activeStatus: 0 })
              .where(eq(smClassTeachers.id, currentSlot.id))
          ];

    const insert = ctx.db.insert(smClassTeachers).values({
      assignClassTeacherId: headerId,
      teacherId: params.staffId,
      schoolId,
      academicId,
      activeStatus: 1,
      ...(ctx.tenant.userId === null ? {} : { createdBy: ctx.tenant.userId })
    });

    await batchOrThrow(ctx.db, [...deactivate, insert]);
    return { assignClassTeacherId: headerId };
  }, "assignClassTeacher");
}

export async function assignSubjectTeacher(
  ctx: ScopedRepositoryContext,
  params: AssignSubjectTeacherParams
): Promise<void> {
  await withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;

    const [existing] = await ctx.db
      .select({ id: smAssignSubjects.id })
      .from(smAssignSubjects)
      .where(
        and(
          eq(smAssignSubjects.schoolId, schoolId),
          eq(smAssignSubjects.classId, params.classId),
          eq(smAssignSubjects.sectionId, params.sectionId),
          eq(smAssignSubjects.subjectId, params.subjectId),
          eq(smAssignSubjects.academicId, academicId)
        )
      )
      .limit(1);

    if (existing !== undefined) {
      await ctx.db
        .update(smAssignSubjects)
        .set({
          teacherId: params.staffId,
          activeStatus: 1,
          ...(ctx.tenant.userId === null ? {} : { updatedBy: ctx.tenant.userId })
        })
        .where(eq(smAssignSubjects.id, existing.id));
      return;
    }

    await ctx.db.insert(smAssignSubjects).values({
      schoolId,
      classId: params.classId,
      sectionId: params.sectionId,
      subjectId: params.subjectId,
      teacherId: params.staffId,
      academicId,
      activeStatus: 1,
      ...(ctx.tenant.userId === null ? {} : { createdBy: ctx.tenant.userId })
    });
  }, "assignSubjectTeacher");
}

/** Bulk subject assignment; binds stay inside the D1 limit and commit atomically. */
export async function assignSubjects(
  ctx: ScopedRepositoryContext,
  rows: readonly AssignSubjectRow[]
): Promise<boolean> {
  return withErrorHandling(async () => {
    if (rows.length === 0) return false;
    const normalized = rows.map((row) => ({
      ...row,
      schoolId: ctx.tenant.schoolId,
      academicId: row.academicId ?? requireAcademicId(ctx)
    }));
    await batchOrThrow(ctx.db, chunkedInsert(ctx.db, smAssignSubjects, normalized, 1));
    return true;
  }, "assignSubjects");
}

/**
 * Legacy behaviour: take the first teacher represented in the class-section,
 * then list that teacher's assigned subjects. Teacher selection is preserved;
 * the school predicate is added.
 */
export async function listAssignedSubjects(
  ctx: ScopedRepositoryContext,
  classId: number,
  sectionId: number
): Promise<readonly AssignedSubjectRow[]> {
  return withErrorHandling(async () => {
    if (classId <= 0 || sectionId <= 0) return [];
    const academicId = requireAcademicId(ctx);
    const [assigned] = await ctx.db
      .select({ teacherId: smAssignSubjects.teacherId })
      .from(smAssignSubjects)
      .where(
        and(
          eq(smAssignSubjects.classId, classId),
          eq(smAssignSubjects.sectionId, sectionId),
          eq(smAssignSubjects.academicId, academicId),
          eq(smAssignSubjects.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    if (assigned?.teacherId === null || assigned?.teacherId === undefined) return [];

    const rows = await ctx.db
      .select({
        subjectId: smAssignSubjects.subjectId,
        subjectCode: smSubjects.subjectCode,
        teacherId: smAssignSubjects.teacherId
      })
      .from(smAssignSubjects)
      .leftJoin(smSubjects, eq(smAssignSubjects.subjectId, smSubjects.id))
      .where(
        and(
          eq(smAssignSubjects.classId, classId),
          eq(smAssignSubjects.sectionId, sectionId),
          eq(smAssignSubjects.teacherId, assigned.teacherId),
          eq(smAssignSubjects.academicId, academicId),
          eq(smAssignSubjects.schoolId, ctx.tenant.schoolId)
        )
      )
      .groupBy(smAssignSubjects.subjectId);
    return rows.filter((row): row is AssignedSubjectRow => row.subjectId !== null);
  }, "listAssignedSubjects");
}

export async function findAssignedTeacher(
  ctx: ScopedRepositoryContext,
  subjectId: number,
  classId: number,
  sectionId: number
): Promise<AssignSubjectRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(smAssignSubjects)
      .where(
        and(
          eq(smAssignSubjects.subjectId, subjectId),
          eq(smAssignSubjects.classId, classId),
          eq(smAssignSubjects.sectionId, sectionId),
          eq(smAssignSubjects.activeStatus, 1),
          eq(smAssignSubjects.academicId, requireAcademicId(ctx)),
          eq(smAssignSubjects.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findAssignedTeacher");
}
