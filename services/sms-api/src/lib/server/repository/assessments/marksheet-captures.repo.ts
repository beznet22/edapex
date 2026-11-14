import { and, desc, eq } from "drizzle-orm";

import { marksheetCaptures } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type MarksheetCaptureRow = typeof marksheetCaptures.$inferSelect;
export type NewMarksheetCaptureRow = Omit<typeof marksheetCaptures.$inferInsert, "schoolId">;
export type MarksheetCapturePatch = Partial<
  Omit<typeof marksheetCaptures.$inferInsert, "id" | "schoolId" | "createdAt">
>;

export interface CaptureFileLookup {
  readonly classId: number;
  readonly sectionId: number;
  readonly examTypeId: number;
  readonly contentSha256: string;
  readonly parserVersion: string;
}

export async function findCaptureById(
  ctx: ScopedRepositoryContext,
  id: string
): Promise<MarksheetCaptureRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(marksheetCaptures)
      .where(
        and(
          eq(marksheetCaptures.id, id),
          eq(marksheetCaptures.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findCaptureById");
}

export async function findCaptureByFile(
  ctx: ScopedRepositoryContext,
  lookup: CaptureFileLookup
): Promise<MarksheetCaptureRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(marksheetCaptures)
      .where(
        and(
          eq(marksheetCaptures.schoolId, ctx.tenant.schoolId),
          eq(marksheetCaptures.classId, lookup.classId),
          eq(marksheetCaptures.sectionId, lookup.sectionId),
          eq(marksheetCaptures.examTypeId, lookup.examTypeId),
          eq(marksheetCaptures.ocrContentSha256, lookup.contentSha256),
          eq(marksheetCaptures.ocrParserVersion, lookup.parserVersion)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findCaptureByFile");
}

export async function findCaptureForStudentExam(
  ctx: ScopedRepositoryContext,
  studentId: number,
  examTypeId: number
): Promise<MarksheetCaptureRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(marksheetCaptures)
      .where(
        and(
          eq(marksheetCaptures.schoolId, ctx.tenant.schoolId),
          eq(marksheetCaptures.studentId, studentId),
          eq(marksheetCaptures.examTypeId, examTypeId)
        )
      )
      .orderBy(desc(marksheetCaptures.updatedAt))
      .limit(1);
    return row ?? null;
  }, "findCaptureForStudentExam");
}

export async function listCapturesForClassExam(
  ctx: ScopedRepositoryContext,
  classId: number,
  sectionId: number,
  examTypeId: number,
  status?: MarksheetCaptureRow["status"]
): Promise<readonly MarksheetCaptureRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(marksheetCaptures)
        .where(
          and(
            eq(marksheetCaptures.schoolId, ctx.tenant.schoolId),
            eq(marksheetCaptures.classId, classId),
            eq(marksheetCaptures.sectionId, sectionId),
            eq(marksheetCaptures.examTypeId, examTypeId),
            status === undefined ? undefined : eq(marksheetCaptures.status, status)
          )
        )
        .orderBy(desc(marksheetCaptures.createdAt)),
    "listCapturesForClassExam"
  );
}

export async function createCapture(
  ctx: ScopedRepositoryContext,
  capture: NewMarksheetCaptureRow
): Promise<MarksheetCaptureRow> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .insert(marksheetCaptures)
      .values({ ...capture, schoolId: ctx.tenant.schoolId })
      .returning();
    if (row === undefined) {
      throw new Error("Insert into marksheet_captures returned no row");
    }
    return row;
  }, "createCapture");
}

export async function updateCapture(
  ctx: ScopedRepositoryContext,
  id: string,
  patch: MarksheetCapturePatch,
  now: number = Math.floor(Date.now() / 1000)
): Promise<MarksheetCaptureRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .update(marksheetCaptures)
      .set({ ...patch, updatedAt: now })
      .where(
        and(
          eq(marksheetCaptures.id, id),
          eq(marksheetCaptures.schoolId, ctx.tenant.schoolId)
        )
      )
      .returning();
    return row ?? null;
  }, "updateCapture");
}
