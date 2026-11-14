import { and, asc, eq, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { archiveObjects } from "../../db/schema";
import { batchOrThrow, chunkedInArray } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { ArchiveObjectRow } from "./types";

const scoped = (ctx: ScopedRepositoryContext) =>
  eq(archiveObjects.schoolId, ctx.tenant.schoolId);

export async function listArchiveObjectsForSessionsPage(
  ctx: ScopedRepositoryContext,
  params: {
    readonly academicIds: readonly number[];
    readonly afterId: number;
    readonly limit: number;
  }
): Promise<readonly ArchiveObjectRow[]> {
  return withErrorHandling(async () => {
    const predicates = chunkedInArray(archiveObjects.academicId, params.academicIds);
    if (predicates.length === 0) return [];
    return ctx.db
      .select()
      .from(archiveObjects)
      .where(
        and(
          scoped(ctx),
          or(...predicates),
          sql`${archiveObjects.id} > ${params.afterId}`
        )
      )
      .orderBy(asc(archiveObjects.id))
      .limit(params.limit);
  }, "listArchiveObjectsForSessionsPage");
}

export async function deleteArchiveObjectsByIds(
  ctx: ScopedRepositoryContext,
  ids: readonly number[]
): Promise<void> {
  await withErrorHandling(async () => {
    if (ids.length === 0) return;
    await batchOrThrow(
      ctx.db,
      chunkedInArray(archiveObjects.id, ids).map((predicate) =>
        ctx.db.delete(archiveObjects).where(and(scoped(ctx), predicate))
      )
    );
  }, "deleteArchiveObjectsByIds");
}

export async function deleteArchiveObjectsForSessions(
  ctx: ScopedRepositoryContext,
  academicIds: readonly number[]
): Promise<void> {
  await withErrorHandling(async () => {
    const statements: BatchItem<"sqlite">[] = chunkedInArray(
      archiveObjects.academicId,
      academicIds
    ).map((predicate) => ctx.db.delete(archiveObjects).where(and(scoped(ctx), predicate)));
    if (statements.length === 0) return;
    await batchOrThrow(ctx.db, statements);
  }, "deleteArchiveObjectsForSessions");
}

export async function deleteArchiveObjectsForSchool(
  ctx: ScopedRepositoryContext
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db.delete(archiveObjects).where(scoped(ctx));
  }, "deleteArchiveObjectsForSchool");
}
