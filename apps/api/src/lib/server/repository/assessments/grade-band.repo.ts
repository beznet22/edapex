import { and, asc, eq } from "drizzle-orm";

import { smMarksGrades } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface CopyGradeBandsResult {
  readonly map: ReadonlyMap<number, number>;
  readonly created: number;
}

const now = () => Math.floor(Date.now() / 1000);

export async function copyGradeBands(
  ctx: ScopedRepositoryContext,
  input: { readonly sourceAcademicId: number; readonly targetAcademicId: number; readonly actorId: number }
): Promise<CopyGradeBandsResult> {
  return withErrorHandling(async () => {
    const source = await ctx.db
      .select()
      .from(smMarksGrades)
      .where(eq(smMarksGrades.schoolId, ctx.tenant.schoolId))
      .orderBy(asc(smMarksGrades.id));
    const map = new Map<number, number>();
    let created = 0;
    for (const row of source) {
      const [existing] = await ctx.db
        .select({ id: smMarksGrades.id })
        .from(smMarksGrades)
        .where(
          and(
            eq(smMarksGrades.schoolId, ctx.tenant.schoolId),
            eq(smMarksGrades.academicId, input.targetAcademicId),
            eq(smMarksGrades.gradeName, row.gradeName ?? "")
          )
        )
        .limit(1);
      let targetId = existing?.id;
      if (targetId === undefined) {
        const [inserted] = await ctx.db
          .insert(smMarksGrades)
          .values({
            gradeName: row.gradeName,
            gpa: row.gpa,
            from: row.from,
            up: row.up,
            percentFrom: row.percentFrom,
            percentUpto: row.percentUpto,
            description: row.description,
            activeStatus: 1,
            schoolId: ctx.tenant.schoolId,
            academicId: input.targetAcademicId,
            createdBy: input.actorId,
            updatedBy: input.actorId,
            createdAt: now(),
            updatedAt: now()
          })
          .returning({ id: smMarksGrades.id });
        if (inserted === undefined) throw new Error("Insert into sm_marks_grades returned no row");
        targetId = inserted.id;
        created += 1;
      }
      map.set(row.id, targetId);
    }
    return { map, created };
  }, "copyGradeBands");
}
