import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { examMeritPositions } from "../../db/schema";
import { batchOrThrow, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type NewMeritPosition = typeof examMeritPositions.$inferInsert;

export interface ReplaceMeritParams {
  readonly classId: number;
  readonly sectionId: number;
  readonly examTermId: number;
  readonly rows: readonly NewMeritPosition[];
}

/**
 * Replaces the merit table for one class-section and term. The averaging and
 * ordering are pure computations owned by Phase 3; this primitive only writes
 * the supplied rows atomically.
 */
export async function replaceMeritPositions(
  ctx: ScopedRepositoryContext,
  params: ReplaceMeritParams
): Promise<number> {
  return withErrorHandling(async () => {
    if (params.rows.length === 0) return 0;
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;

    const statements: BatchItem<"sqlite">[] = [
      ctx.db
        .delete(examMeritPositions)
        .where(
          and(
            eq(examMeritPositions.classId, params.classId),
            eq(examMeritPositions.sectionId, params.sectionId),
            eq(examMeritPositions.examTermId, params.examTermId),
            eq(examMeritPositions.schoolId, schoolId),
            eq(examMeritPositions.academicId, academicId)
          )
        )
    ];
    const rows = params.rows.map((row) => ({ ...row, schoolId, academicId }));
    statements.push(...chunkedInsert(ctx.db, examMeritPositions, rows, 1));
    await batchOrThrow(ctx.db, statements);
    return rows.length;
  }, "replaceMeritPositions");
}
