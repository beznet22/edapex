import { and, asc, eq } from "drizzle-orm";

import { smStudentCategories } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

interface CopyStructureResult {
  readonly map: ReadonlyMap<number, number>;
  readonly created: number;
  readonly added: number;
}

const now = () => Math.floor(Date.now() / 1000);

export async function copyCategories(
  ctx: ScopedRepositoryContext,
  input: { readonly sourceAcademicId: number; readonly targetAcademicId: number; readonly actorId: number }
): Promise<CopyStructureResult> {
  return withErrorHandling(async () => {
    const source = await ctx.db
      .select()
      .from(smStudentCategories)
      .where(eq(smStudentCategories.schoolId, ctx.tenant.schoolId))
      .orderBy(asc(smStudentCategories.id));
    const map = new Map<number, number>();
    let created = 0;
    for (const row of source) {
      const [existing] = await ctx.db
        .select({ id: smStudentCategories.id })
        .from(smStudentCategories)
        .where(
          and(
            eq(smStudentCategories.schoolId, ctx.tenant.schoolId),
            eq(smStudentCategories.academicId, input.targetAcademicId),
            eq(smStudentCategories.categoryName, row.categoryName ?? "")
          )
        )
        .limit(1);
      let targetId = existing?.id;
      if (targetId === undefined) {
        const [inserted] = await ctx.db
          .insert(smStudentCategories)
          .values({
            categoryName: row.categoryName,
            schoolId: ctx.tenant.schoolId,
            academicId: input.targetAcademicId,
            createdBy: input.actorId,
            updatedBy: input.actorId,
            createdAt: now(),
            updatedAt: now()
          })
          .returning({ id: smStudentCategories.id });
        if (inserted === undefined) {
          throw new Error("Insert into sm_student_categories returned no row");
        }
        targetId = inserted.id;
        created += 1;
      }
      map.set(row.id, targetId);
    }

    let added = 0;
    const [upperBasic] = await ctx.db
      .select({ id: smStudentCategories.id })
      .from(smStudentCategories)
      .where(
        and(
          eq(smStudentCategories.schoolId, ctx.tenant.schoolId),
          eq(smStudentCategories.academicId, input.targetAcademicId),
          eq(smStudentCategories.categoryName, "UPPERBASIC")
        )
      )
      .limit(1);
    if (upperBasic === undefined) {
      await ctx.db.insert(smStudentCategories).values({
        categoryName: "UPPERBASIC",
        schoolId: ctx.tenant.schoolId,
        academicId: input.targetAcademicId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now(),
        updatedAt: now()
      });
      added = 1;
    }
    return { map, created, added };
  }, "copyCategories");
}
