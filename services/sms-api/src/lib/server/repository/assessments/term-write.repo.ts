import { and, asc, eq } from "drizzle-orm";

import { smExamTypes } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface TermWriteRow {
  readonly id: number;
  readonly name: string;
  readonly sequence: number;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly status: "planned" | "active" | "closed";
  readonly grading: string | null;
  readonly legacySuffix: string | null;
}

export interface UpsertTermInput {
  readonly academicId: number;
  readonly sequence: number;
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly status: "planned" | "active" | "closed";
  readonly grading?: string | null;
  readonly legacySuffix?: string | null;
  readonly actorId: number;
}

export async function listTermsForYear(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<readonly TermWriteRow[]> {
  return withErrorHandling(async () => {
    return ctx.db
      .select({
        id: smExamTypes.id,
        name: smExamTypes.name,
        sequence: smExamTypes.sequence,
        startsOn: smExamTypes.startsOn,
        endsOn: smExamTypes.endsOn,
        status: smExamTypes.status,
        grading: smExamTypes.grading,
        legacySuffix: smExamTypes.legacySuffix
      })
      .from(smExamTypes)
      .where(
        and(
          eq(smExamTypes.schoolId, ctx.tenant.schoolId),
          eq(smExamTypes.academicId, academicId)
        )
      )
      .orderBy(asc(smExamTypes.sequence));
  }, "listTermsForYear");
}

export async function findTermBySequence(
  ctx: ScopedRepositoryContext,
  academicId: number,
  sequence: number
): Promise<TermWriteRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        id: smExamTypes.id,
        name: smExamTypes.name,
        sequence: smExamTypes.sequence,
        startsOn: smExamTypes.startsOn,
        endsOn: smExamTypes.endsOn,
        status: smExamTypes.status,
        grading: smExamTypes.grading,
        legacySuffix: smExamTypes.legacySuffix
      })
      .from(smExamTypes)
      .where(
        and(
          eq(smExamTypes.schoolId, ctx.tenant.schoolId),
          eq(smExamTypes.academicId, academicId),
          eq(smExamTypes.sequence, sequence)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findTermBySequence");
}

export async function upsertTerm(
  ctx: ScopedRepositoryContext,
  input: UpsertTermInput,
  now: number = Math.floor(Date.now() / 1000)
): Promise<number> {
  return withErrorHandling(async () => {
    const existing = await findTermBySequence(ctx, input.academicId, input.sequence);
    if (existing !== null) {
      await ctx.db
        .update(smExamTypes)
        .set({
          name: input.name,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          status: input.status,
          grading: input.grading ?? existing.grading,
          legacySuffix: input.legacySuffix ?? existing.legacySuffix,
          updatedBy: input.actorId,
          updatedAt: now
        })
        .where(
          and(
            eq(smExamTypes.id, existing.id),
            eq(smExamTypes.schoolId, ctx.tenant.schoolId)
          )
        );
      return existing.id;
    }
    const [inserted] = await ctx.db
      .insert(smExamTypes)
      .values({
        activeStatus: 1,
        name: input.name,
        schoolId: ctx.tenant.schoolId,
        academicId: input.academicId,
        parentId: 0,
        sequence: input.sequence,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        status: input.status,
        grading: input.grading ?? null,
        legacySuffix: input.legacySuffix ?? null,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now,
        updatedAt: now
      })
      .returning({ id: smExamTypes.id });
    if (inserted === undefined) throw new Error("Insert into sm_exam_types returned no row");
    return inserted.id;
  }, "upsertTerm");
}
