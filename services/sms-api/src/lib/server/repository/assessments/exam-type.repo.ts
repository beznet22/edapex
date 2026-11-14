import { and, asc, eq, sql } from "drizzle-orm";

import { smExamTypes } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type ExamTypeRow = typeof smExamTypes.$inferSelect;

export interface NewExamTypeInput {
  readonly name: string;
  readonly sequence: number;
  readonly startsOn?: string | null;
  readonly endsOn?: string | null;
  readonly status?: "planned" | "active" | "closed";
  readonly grading?: string | null;
}

/** Includes inactive terms; `exam.repo.listExamTypes` is the active-only read. */
export async function listAllExamTypes(
  ctx: ScopedRepositoryContext
): Promise<readonly ExamTypeRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(smExamTypes)
        .where(
          and(
            eq(smExamTypes.schoolId, ctx.tenant.schoolId),
            eq(smExamTypes.academicId, requireAcademicId(ctx))
          )
        )
        .orderBy(asc(smExamTypes.sequence)),
    "listAllExamTypes"
  );
}

export async function findNextExamTypeSequence(
  ctx: ScopedRepositoryContext
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ value: sql<number>`coalesce(max(${smExamTypes.sequence}), 0)` })
      .from(smExamTypes)
      .where(
        and(
          eq(smExamTypes.schoolId, ctx.tenant.schoolId),
          eq(smExamTypes.academicId, requireAcademicId(ctx))
        )
      );
    return Number(row?.value ?? 0) + 1;
  }, "findNextExamTypeSequence");
}

export async function createExamType(
  ctx: ScopedRepositoryContext,
  input: NewExamTypeInput,
  now: number = Math.floor(Date.now() / 1000)
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .insert(smExamTypes)
      .values({
        name: input.name,
        sequence: input.sequence,
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
        status: input.status ?? "planned",
        grading: input.grading ?? null,
        activeStatus: 1,
        schoolId: ctx.tenant.schoolId,
        academicId: requireAcademicId(ctx),
        createdAt: now,
        updatedAt: now
      })
      .returning({ id: smExamTypes.id });

    if (row === undefined) {
      throw new Error("Insert into sm_exam_types returned no id");
    }
    return row.id;
  }, "createExamType");
}

export async function updateExamTypeActive(
  ctx: ScopedRepositoryContext,
  examTypeId: number,
  active: boolean,
  now: number = Math.floor(Date.now() / 1000)
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .update(smExamTypes)
        .set({ activeStatus: active ? 1 : 0, updatedAt: now })
        .where(
          and(
            eq(smExamTypes.id, examTypeId),
            eq(smExamTypes.schoolId, ctx.tenant.schoolId),
            eq(smExamTypes.academicId, requireAcademicId(ctx))
          )
        );
    },
    "updateExamTypeActive"
  );
}
