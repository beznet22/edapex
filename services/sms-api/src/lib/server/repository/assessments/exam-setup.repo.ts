import { and, desc, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { smExamSetups, smExamTypes, smMarkStores } from "../../db/schema";
import { DbInternalError } from "../base/errors";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type ExamSetupRow = typeof smExamSetups.$inferSelect;
export type NewExamSetup = typeof smExamSetups.$inferInsert;

export type ExamSetupInput = Omit<
  NewExamSetup,
  "id" | "createdAt" | "updatedAt" | "schoolId" | "academicId"
>;

export interface ExamSetupLookup {
  readonly classId: number;
  readonly sectionId: number;
  readonly subjectId?: number;
  readonly examTypeId: number;
}

export interface SubjectFullMarkQuery {
  readonly examTypeId: number;
  readonly subjectId: number;
  readonly classId: number;
  readonly sectionId: number;
}

const setupColumns = {
  id: smExamSetups.id,
  examTitle: smExamSetups.examTitle,
  classId: smExamSetups.classId,
  sectionId: smExamSetups.sectionId,
  subjectId: smExamSetups.subjectId,
  examId: smExamSetups.examId
} as const;

async function resolveTermId(
  ctx: ScopedRepositoryContext,
  examTermId: number | undefined
): Promise<number | null> {
  if (examTermId !== undefined) return examTermId;
  const [term] = await ctx.db
    .select({ id: smExamTypes.id })
    .from(smExamTypes)
    .where(
      and(
        eq(smExamTypes.activeStatus, 1),
        eq(smExamTypes.academicId, requireAcademicId(ctx)),
        eq(smExamTypes.schoolId, ctx.tenant.schoolId)
      )
    )
    .orderBy(desc(smExamTypes.sequence))
    .limit(1);
  return term?.id ?? null;
}

/** Updates the component title across every matching setup; returns the count. */
export async function updateExamSetup(
  ctx: ScopedRepositoryContext,
  params: {
    readonly classId: number;
    readonly sectionId: number;
    readonly examTermId: number;
    readonly examTitle: string;
  }
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(smExamSetups)
      .set({
        examTitle: params.examTitle,
        updatedAt: Math.floor(Date.now() / 1000)
      })
      .where(
        and(
          eq(smExamSetups.classId, params.classId),
          eq(smExamSetups.sectionId, params.sectionId),
          eq(smExamSetups.examTermId, params.examTermId),
          eq(smExamSetups.academicId, requireAcademicId(ctx)),
          eq(smExamSetups.schoolId, ctx.tenant.schoolId)
        )
      )
      .returning({ id: smExamSetups.id });
    return rows.length;
  }, "updateExamSetup");
}

/** Upsert on (title, exam, term, subject, class, section) within the tenant. */
export async function upsertExamSetup(
  ctx: ScopedRepositoryContext,
  input: ExamSetupInput
): Promise<number> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;
    const where = and(
      eq(smExamSetups.examTitle, input.examTitle ?? ""),
      eq(smExamSetups.examId, input.examId ?? 0),
      eq(smExamSetups.examTermId, input.examTermId ?? 0),
      eq(smExamSetups.subjectId, input.subjectId ?? 0),
      eq(smExamSetups.classId, input.classId ?? 0),
      eq(smExamSetups.sectionId, input.sectionId ?? 0),
      eq(smExamSetups.academicId, academicId),
      eq(smExamSetups.schoolId, schoolId)
    );

    const [existing] = await ctx.db
      .select({ id: smExamSetups.id })
      .from(smExamSetups)
      .where(where)
      .limit(1);

    if (existing !== undefined) {
      await ctx.db
        .update(smExamSetups)
        .set({ ...input, academicId, schoolId })
        .where(eq(smExamSetups.id, existing.id));
      return existing.id;
    }

    const [inserted] = await ctx.db
      .insert(smExamSetups)
      .values({ ...input, academicId, schoolId })
      .returning({ id: smExamSetups.id });
    if (inserted === undefined) {
      throw new DbInternalError("Insert into sm_exam_setups returned no id");
    }
    return inserted.id;
  }, "upsertExamSetup");
}

export async function findExamSetupsByClassSection(
  ctx: ScopedRepositoryContext,
  classId: number,
  sectionId: number,
  examTermId?: number
): Promise<readonly Partial<ExamSetupRow>[]> {
  return withErrorHandling(async () => {
    const termId = await resolveTermId(ctx, examTermId);
    if (termId === null) return [];
    return ctx.db
      .select(setupColumns)
      .from(smExamSetups)
      .where(
        and(
          eq(smExamSetups.classId, classId),
          eq(smExamSetups.sectionId, sectionId),
          eq(smExamSetups.examTermId, termId),
          eq(smExamSetups.academicId, requireAcademicId(ctx)),
          eq(smExamSetups.schoolId, ctx.tenant.schoolId)
        )
      );
  }, "findExamSetupsByClassSection");
}

export async function findExamSetup(
  ctx: ScopedRepositoryContext,
  lookup: ExamSetupLookup
): Promise<readonly ExamSetupRow[]> {
  return withErrorHandling(async () => {
    const conditions: SQL<unknown>[] = [
      eq(smExamSetups.classId, lookup.classId),
      eq(smExamSetups.sectionId, lookup.sectionId),
      eq(smExamSetups.examTermId, lookup.examTypeId),
      eq(smExamSetups.academicId, requireAcademicId(ctx)),
      eq(smExamSetups.schoolId, ctx.tenant.schoolId)
    ];
    if (lookup.subjectId !== undefined) {
      conditions.push(eq(smExamSetups.subjectId, lookup.subjectId));
    }
    return ctx.db
      .select()
      .from(smExamSetups)
      .where(and(...conditions));
  }, "findExamSetup");
}

/** Full marks for a subject in a term, scoped to the caller's tenant. */
export async function findSubjectFullMark(
  ctx: ScopedRepositoryContext,
  query: SubjectFullMarkQuery
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ totalMark: smMarkStores.totalMarks })
      .from(smMarkStores)
      .where(
        and(
          eq(smMarkStores.examTermId, query.examTypeId),
          eq(smMarkStores.subjectId, query.subjectId),
          eq(smMarkStores.classId, query.classId),
          eq(smMarkStores.sectionId, query.sectionId),
          eq(smMarkStores.academicId, requireAcademicId(ctx)),
          eq(smMarkStores.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row?.totalMark ?? 0;
  }, "findSubjectFullMark");
}
