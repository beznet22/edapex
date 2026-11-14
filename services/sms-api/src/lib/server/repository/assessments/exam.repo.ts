import { and, desc, eq } from "drizzle-orm";

import { smExamTypes, smExams } from "../../db/schema";
import { DbInternalError } from "../base/errors";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";
import { parseTermGrading } from "./terms";
import type { TermSummary } from "./terms";

export type ExamRow = typeof smExams.$inferSelect;
export type NewExam = typeof smExams.$inferInsert;

export interface ExamIdentity {
  readonly classId: number;
  readonly sectionId: number;
  readonly subjectId: number;
  readonly examTypeId: number;
}

const termColumns = {
  id: smExamTypes.id,
  name: smExamTypes.name,
  sequence: smExamTypes.sequence,
  status: smExamTypes.status,
  startsOn: smExamTypes.startsOn,
  endsOn: smExamTypes.endsOn,
  legacySuffix: smExamTypes.legacySuffix,
  grading: smExamTypes.grading
} as const;

const toTermSummary = (row: {
  readonly id: number;
  readonly name: string;
  readonly sequence: number;
  readonly status: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly legacySuffix: string | null;
  readonly grading: string | null;
}): TermSummary => {
  const grading = parseTermGrading(row.grading);
  return {
    id: row.id,
    name: row.name,
    sequence: row.sequence,
    status: row.status,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    legacySuffix: row.legacySuffix,
    isAverage: grading.isAverage,
    percentage: grading.percentage,
    averageMark: grading.averageMark
  };
};

export async function listExamTypes(
  ctx: ScopedRepositoryContext
): Promise<readonly TermSummary[]> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select(termColumns)
      .from(smExamTypes)
      .where(
        and(
          eq(smExamTypes.activeStatus, 1),
          eq(smExamTypes.academicId, requireAcademicId(ctx)),
          eq(smExamTypes.schoolId, ctx.tenant.schoolId)
        )
      )
      .orderBy(smExamTypes.sequence);
    return rows.map(toTermSummary);
  }, "listExamTypes");
}

/** Latest term by sequence, optionally a specific one. */
export async function findCurrentTerm(
  ctx: ScopedRepositoryContext,
  examId?: number
): Promise<TermSummary | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select(termColumns)
      .from(smExamTypes)
      .where(
        and(
          eq(smExamTypes.activeStatus, 1),
          eq(smExamTypes.academicId, requireAcademicId(ctx)),
          eq(smExamTypes.schoolId, ctx.tenant.schoolId),
          ...(examId === undefined ? [] : [eq(smExamTypes.id, examId)])
        )
      )
      .orderBy(desc(smExamTypes.sequence))
      .limit(1);
    return row === undefined ? null : toTermSummary(row);
  }, "findCurrentTerm");
}

/**
 * Returns the exam id for the natural key, inserting the boilerplate row when
 * absent (`05 §4.2`). The unique key is (school, academic, term, class,
 * section, subject).
 */
export async function ensureExam(
  ctx: ScopedRepositoryContext,
  identity: ExamIdentity,
  marks: { readonly examMark?: number | null; readonly passMark?: number | null } = {}
): Promise<number> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;

    const [existing] = await ctx.db
      .select({ id: smExams.id })
      .from(smExams)
      .where(
        and(
          eq(smExams.classId, identity.classId),
          eq(smExams.sectionId, identity.sectionId),
          eq(smExams.subjectId, identity.subjectId),
          eq(smExams.examTypeId, identity.examTypeId),
          eq(smExams.academicId, academicId),
          eq(smExams.schoolId, schoolId)
        )
      )
      .limit(1);
    if (existing !== undefined) return existing.id;

    const [inserted] = await ctx.db
      .insert(smExams)
      .values({
        classId: identity.classId,
        sectionId: identity.sectionId,
        subjectId: identity.subjectId,
        examTypeId: identity.examTypeId,
        academicId,
        schoolId,
        examMark: marks.examMark ?? 100,
        passMark: marks.passMark ?? 70,
        activeStatus: 1
      })
      .returning({ id: smExams.id });
    if (inserted === undefined) {
      throw new DbInternalError("Insert into sm_exams returned no id");
    }
    return inserted.id;
  }, "ensureExam");
}

export interface ExamSummary {
  readonly id: number;
  readonly subjectId: number | null;
}

/** One read for every exam in a class/section/term; avoids per-subject lookups. */
export async function listExamsByClassSection(
  ctx: ScopedRepositoryContext,
  classId: number,
  sectionId: number,
  examTypeId: number
): Promise<readonly ExamSummary[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select({ id: smExams.id, subjectId: smExams.subjectId })
        .from(smExams)
        .where(
          and(
            eq(smExams.classId, classId),
            eq(smExams.sectionId, sectionId),
            eq(smExams.examTypeId, examTypeId),
            eq(smExams.academicId, requireAcademicId(ctx)),
            eq(smExams.schoolId, ctx.tenant.schoolId),
            eq(smExams.activeStatus, 1)
          )
        ),
    "listExamsByClassSection"
  );
}
