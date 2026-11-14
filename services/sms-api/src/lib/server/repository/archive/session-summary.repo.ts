import { and, asc, desc, eq, sql } from "drizzle-orm";

import { sessionResultSummary } from "../../db/schema";
import { batchOrThrow, chunkedInArray, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type SessionSummaryRow = typeof sessionResultSummary.$inferSelect;
export type NewSessionSummary = typeof sessionResultSummary.$inferInsert;

const scoped = (ctx: ScopedRepositoryContext) =>
  eq(sessionResultSummary.schoolId, ctx.tenant.schoolId);

/** Replaces one student's term summaries in a single batch. */
export async function replaceSessionSummariesForStudent(
  ctx: ScopedRepositoryContext,
  params: {
    readonly academicId: number;
    readonly studentId: number;
    readonly rows: readonly NewSessionSummary[];
  }
): Promise<void> {
  await withErrorHandling(async () => {
    const deletion = ctx.db
      .delete(sessionResultSummary)
      .where(
        and(
          scoped(ctx),
          eq(sessionResultSummary.academicId, params.academicId),
          eq(sessionResultSummary.studentId, params.studentId)
        )
      );
    const statements = [deletion, ...chunkedInsert(ctx.db, sessionResultSummary, params.rows, 1)];
    await batchOrThrow(ctx.db, statements);
  }, "replaceSessionSummariesForStudent");
}

export async function listSessionSummariesForStudent(
  ctx: ScopedRepositoryContext,
  params: { readonly academicId: number; readonly studentId: number }
): Promise<readonly SessionSummaryRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(sessionResultSummary)
        .where(
          and(
            scoped(ctx),
            eq(sessionResultSummary.academicId, params.academicId),
            eq(sessionResultSummary.studentId, params.studentId)
          )
        )
        .orderBy(asc(sessionResultSummary.sequence)),
    "listSessionSummariesForStudent"
  );
}

export async function listSessionSummariesForStudentAllSessions(
  ctx: ScopedRepositoryContext,
  studentId: number
): Promise<readonly SessionSummaryRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(sessionResultSummary)
        .where(
          and(scoped(ctx), eq(sessionResultSummary.studentId, studentId))
        )
        .orderBy(desc(sessionResultSummary.academicId), asc(sessionResultSummary.sequence)),
    "listSessionSummariesForStudentAllSessions"
  );
}

export async function listSessionSummariesForSession(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<readonly SessionSummaryRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(sessionResultSummary)
        .where(and(scoped(ctx), eq(sessionResultSummary.academicId, academicId)))
        .orderBy(asc(sessionResultSummary.studentId), asc(sessionResultSummary.sequence)),
    "listSessionSummariesForSession"
  );
}

export async function countSessionSummariesForSession(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ value: sql<number>`count(*)` })
      .from(sessionResultSummary)
      .where(and(scoped(ctx), eq(sessionResultSummary.academicId, academicId)));
    return Number(row?.value ?? 0);
  }, "countSessionSummariesForSession");
}

export async function deleteSessionSummariesForSessions(
  ctx: ScopedRepositoryContext,
  academicIds: readonly number[]
): Promise<void> {
  await withErrorHandling(async () => {
    if (academicIds.length === 0) return;
    const predicates = chunkedInArray(sessionResultSummary.academicId, academicIds);
    await batchOrThrow(
      ctx.db,
      predicates.map((predicate) =>
        ctx.db.delete(sessionResultSummary).where(and(scoped(ctx), predicate))
      )
    );
  }, "deleteSessionSummariesForSessions");
}

export async function deleteSessionSummariesForSchool(
  ctx: ScopedRepositoryContext
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db.delete(sessionResultSummary).where(scoped(ctx));
  }, "deleteSessionSummariesForSchool");
}
