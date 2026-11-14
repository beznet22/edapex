import { and, eq } from "drizzle-orm";

import { smExamTypes, smExams } from "../../db/schema";
import { batchOrThrow, chunkedInsertIgnore } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface ExamConfigResult {
  readonly planned: number;
  readonly terms: number;
}

export interface ExamConfigAssignment {
  readonly classId: number;
  readonly sectionId: number;
  readonly subjectId: number;
}

/**
 * `05 §4.2`: the new session's `sm_exams` rows are regenerated from subject
 * assignments x terms, not copied from the previous ladder. The unique index
 * makes the insert idempotent.
 */
export async function ensureExamConfigs(
  ctx: ScopedRepositoryContext,
  input: { readonly academicId: number; readonly actorId: number },
  assignments: readonly ExamConfigAssignment[]
): Promise<ExamConfigResult> {
  return withErrorHandling(async () => {
    const terms = await ctx.db
      .select({ id: smExamTypes.id })
      .from(smExamTypes)
      .where(
        and(
          eq(smExamTypes.schoolId, ctx.tenant.schoolId),
          eq(smExamTypes.academicId, input.academicId),
          eq(smExamTypes.activeStatus, 1)
        )
      );
    const now = Math.floor(Date.now() / 1000);
    const rows = [];
    for (const assignment of assignments) {
      for (const term of terms) {
        rows.push({
          parentId: 0,
          examMark: 100,
          passMark: 70,
          activeStatus: 1,
          examTypeId: term.id,
          classId: assignment.classId,
          sectionId: assignment.sectionId,
          subjectId: assignment.subjectId,
          schoolId: ctx.tenant.schoolId,
          academicId: input.academicId,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: now,
          updatedAt: now
        });
      }
    }
    for (let index = 0; index < rows.length; index += 500) {
      const statements = chunkedInsertIgnore(
        ctx.db,
        smExams,
        rows.slice(index, index + 500),
        1
      );
      if (statements.length > 0) await batchOrThrow(ctx.db, statements);
    }
    return { planned: rows.length, terms: terms.length };
  }, "ensureExamConfigs");
}
