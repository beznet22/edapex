import { and, count, eq } from "drizzle-orm";

import { classAttendances } from "../../db/schema";
import { batchOrThrow, chunkedInsertIgnore, MAX_BATCH_STATEMENTS } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface ClassAttendanceInput {
  readonly studentId: number | null;
  readonly examTypeId: number | null;
  readonly daysOpened?: number | null;
  readonly daysAbsent?: number | null;
  readonly daysPresent?: number | null;
}

/**
 * Upsert on the `(student_id, exam_type_id)` natural key (`O8`). Missing
 * student or term returns null, as the legacy method did.
 */
export async function upsertClassAttendance(
  ctx: ScopedRepositoryContext,
  input: ClassAttendanceInput
): Promise<number | null> {
  return withErrorHandling(async () => {
    if (input.studentId === null || input.examTypeId === null) return null;

    const now = Math.floor(Date.now() / 1000);
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;

    const rows = await ctx.db
      .insert(classAttendances)
      .values({
        studentId: input.studentId,
        examTypeId: input.examTypeId,
        daysOpened: input.daysOpened ?? null,
        daysAbsent: input.daysAbsent ?? null,
        daysPresent: input.daysPresent ?? null,
        academicId,
        schoolId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [classAttendances.studentId, classAttendances.examTypeId],
        set: {
          daysOpened: input.daysOpened ?? null,
          daysAbsent: input.daysAbsent ?? null,
          daysPresent: input.daysPresent ?? null,
          academicId,
          schoolId,
          updatedAt: now
        }
      })
      .returning({ id: classAttendances.id });

    const [row] = rows;
    return row?.id ?? null;
  }, "upsertClassAttendance");
}

export type ClassAttendanceRow = typeof classAttendances.$inferSelect;

export async function readClassAttendanceForStudent(
  ctx: ScopedRepositoryContext,
  params: { readonly studentId: number; readonly academicId: number }
): Promise<readonly ClassAttendanceRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(classAttendances)
        .where(
          and(
            eq(classAttendances.schoolId, ctx.tenant.schoolId),
            eq(classAttendances.academicId, params.academicId),
            eq(classAttendances.studentId, params.studentId)
          )
        ),
    "readClassAttendanceForStudent"
  );
}

export async function countClassAttendanceForStudent(
  ctx: ScopedRepositoryContext,
  params: { readonly studentId: number; readonly academicId: number }
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ value: count() })
      .from(classAttendances)
      .where(
        and(
          eq(classAttendances.schoolId, ctx.tenant.schoolId),
          eq(classAttendances.academicId, params.academicId),
          eq(classAttendances.studentId, params.studentId)
        )
      );
    return Number(row?.value ?? 0);
  }, "countClassAttendanceForStudent");
}

export async function countClassAttendanceForSession(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ value: count() })
      .from(classAttendances)
      .where(
        and(
          eq(classAttendances.schoolId, ctx.tenant.schoolId),
          eq(classAttendances.academicId, academicId)
        )
      );
    return Number(row?.value ?? 0);
  }, "countClassAttendanceForSession");
}

export async function purgeClassAttendanceForSession(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<number> {
  const removed = await countClassAttendanceForSession(ctx, academicId);
  await withErrorHandling(async () => {
    await ctx.db
      .delete(classAttendances)
      .where(
        and(
          eq(classAttendances.schoolId, ctx.tenant.schoolId),
          eq(classAttendances.academicId, academicId)
        )
      );
  }, "purgeClassAttendanceForSession");
  return removed;
}

export async function restoreClassAttendance(
  ctx: ScopedRepositoryContext,
  rows: readonly ClassAttendanceRow[]
): Promise<void> {
  await withErrorHandling(async () => {
    const statements = chunkedInsertIgnore(ctx.db, classAttendances, [...rows], 1);
    for (let index = 0; index < statements.length; index += MAX_BATCH_STATEMENTS) {
      await batchOrThrow(ctx.db, statements.slice(index, index + MAX_BATCH_STATEMENTS));
    }
  }, "restoreClassAttendance");
}
