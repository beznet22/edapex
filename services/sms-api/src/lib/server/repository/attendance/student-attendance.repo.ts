import { and, count, eq } from "drizzle-orm";

import { smStudentAttendances } from "../../db/schema";
import { batchOrThrow, chunkedInsertIgnore, MAX_BATCH_STATEMENTS } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type StudentAttendanceRow = typeof smStudentAttendances.$inferSelect;

const studentFilter = (ctx: ScopedRepositoryContext, studentId: number, academicId: number) =>
  and(
    eq(smStudentAttendances.schoolId, ctx.tenant.schoolId),
    eq(smStudentAttendances.academicId, academicId),
    eq(smStudentAttendances.studentId, studentId)
  );

export async function readStudentAttendance(
  ctx: ScopedRepositoryContext,
  params: { readonly studentId: number; readonly academicId: number }
): Promise<readonly StudentAttendanceRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(smStudentAttendances)
        .where(studentFilter(ctx, params.studentId, params.academicId)),
    "readStudentAttendance"
  );
}

export async function countStudentAttendanceForStudent(
  ctx: ScopedRepositoryContext,
  params: { readonly studentId: number; readonly academicId: number }
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ value: count() })
      .from(smStudentAttendances)
      .where(studentFilter(ctx, params.studentId, params.academicId));
    return Number(row?.value ?? 0);
  }, "countStudentAttendanceForStudent");
}

export async function countStudentAttendanceForSession(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ value: count() })
      .from(smStudentAttendances)
      .where(
        and(
          eq(smStudentAttendances.schoolId, ctx.tenant.schoolId),
          eq(smStudentAttendances.academicId, academicId)
        )
      );
    return Number(row?.value ?? 0);
  }, "countStudentAttendanceForSession");
}

export async function purgeStudentAttendanceForSession(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<number> {
  const removed = await countStudentAttendanceForSession(ctx, academicId);
  await withErrorHandling(async () => {
    await ctx.db
      .delete(smStudentAttendances)
      .where(
        and(
          eq(smStudentAttendances.schoolId, ctx.tenant.schoolId),
          eq(smStudentAttendances.academicId, academicId)
        )
      );
  }, "purgeStudentAttendanceForSession");
  return removed;
}

export async function restoreStudentAttendance(
  ctx: ScopedRepositoryContext,
  rows: readonly StudentAttendanceRow[]
): Promise<void> {
  await withErrorHandling(async () => {
    const statements = chunkedInsertIgnore(ctx.db, smStudentAttendances, [...rows], 1);
    for (let index = 0; index < statements.length; index += MAX_BATCH_STATEMENTS) {
      await batchOrThrow(ctx.db, statements.slice(index, index + MAX_BATCH_STATEMENTS));
    }
  }, "restoreStudentAttendance");
}
