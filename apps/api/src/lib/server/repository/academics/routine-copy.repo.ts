import { and, eq } from "drizzle-orm";

import { smClassRoutines } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface RoutineCopyInput {
  readonly classMap: ReadonlyMap<number, number>;
  readonly sectionMap: ReadonlyMap<number, number>;
  readonly subjectMap: ReadonlyMap<number, number>;
  readonly sourceAcademicId: number;
  readonly targetAcademicId: number;
  readonly actorId: number;
}

export interface RoutineCopyResult {
  readonly copied: number;
  readonly skipped: number;
}

const now = () => Math.floor(Date.now() / 1000);

export async function copyRoutines(
  ctx: ScopedRepositoryContext,
  input: RoutineCopyInput
): Promise<RoutineCopyResult> {
  return withErrorHandling(async () => {
    const source = await ctx.db
      .select()
      .from(smClassRoutines)
      .where(
        and(
          eq(smClassRoutines.schoolId, ctx.tenant.schoolId),
          eq(smClassRoutines.academicId, input.sourceAcademicId),
          eq(smClassRoutines.activeStatus, 1)
        )
      );
    const existing = await ctx.db
      .select({
        classId: smClassRoutines.classId,
        sectionId: smClassRoutines.sectionId,
        subjectId: smClassRoutines.subjectId
      })
      .from(smClassRoutines)
      .where(
        and(
          eq(smClassRoutines.schoolId, ctx.tenant.schoolId),
          eq(smClassRoutines.academicId, input.targetAcademicId),
          eq(smClassRoutines.activeStatus, 1)
        )
      );
    const seen = new Set(
      existing.map((row) => `${row.classId}:${row.sectionId}:${row.subjectId}`)
    );

    let copied = 0;
    let skipped = 0;
    for (const row of source) {
      const classId =
        row.classId === null ? null : input.classMap.get(row.classId) ?? null;
      const sectionId =
        row.sectionId === null ? null : input.sectionMap.get(row.sectionId) ?? null;
      const subjectId =
        row.subjectId === null ? null : input.subjectMap.get(row.subjectId) ?? null;
      if (classId === null || sectionId === null || subjectId === null) {
        skipped += 1;
        continue;
      }
      const key = `${classId}:${sectionId}:${subjectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = row;
      await ctx.db.insert(smClassRoutines).values({
        ...rest,
        classId,
        sectionId,
        subjectId,
        schoolId: ctx.tenant.schoolId,
        academicId: input.targetAcademicId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now(),
        updatedAt: now()
      });
      copied += 1;
    }
    return { copied, skipped };
  }, "copyRoutines");
}
