import { and, desc, eq } from "drizzle-orm";

import { migrationResolutions } from "../../db/schema";
import { batchOrThrow, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type MigrationResolutionRow = typeof migrationResolutions.$inferSelect;
export type NewMigrationResolution = typeof migrationResolutions.$inferInsert;

export interface ResolutionFilters {
  readonly findingId?: string;
  readonly limit?: number;
}

/** Bounded so a 1,700-row transform report cannot exceed the batch guard. */
export async function insertResolutions(
  ctx: ScopedRepositoryContext,
  rows: readonly NewMigrationResolution[]
): Promise<number> {
  return withErrorHandling(async () => {
    if (rows.length === 0) return 0;
    const normalized = rows.map((row) => ({
      ...row,
      schoolId: ctx.tenant.schoolId
    }));
    const statements = chunkedInsert(ctx.db, migrationResolutions, normalized, 1);
    for (let index = 0; index < statements.length; index += 100) {
      await batchOrThrow(ctx.db, statements.slice(index, index + 100));
    }
    return normalized.length;
  }, "insertResolutions");
}

export async function listResolutions(
  ctx: ScopedRepositoryContext,
  filters: ResolutionFilters = {}
): Promise<readonly MigrationResolutionRow[]> {
  return withErrorHandling(async () => {
    const conditions = [eq(migrationResolutions.schoolId, ctx.tenant.schoolId)];
    if (filters.findingId !== undefined) {
      conditions.push(eq(migrationResolutions.findingId, filters.findingId));
    }
    return ctx.db
      .select()
      .from(migrationResolutions)
      .where(and(...conditions))
      .orderBy(desc(migrationResolutions.appliedAt), desc(migrationResolutions.id))
      .limit(filters.limit ?? 5000);
  }, "listResolutions");
}
