import { and, asc, desc, eq, max, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { archiveObjects } from "../../db/schema";
import { batchOrThrow, chunkedInArray, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type ArchiveObjectRow = typeof archiveObjects.$inferSelect;
export type NewArchiveObject = typeof archiveObjects.$inferInsert;
export type ArchiveObjectStatus = ArchiveObjectRow["status"];

const scoped = (ctx: ScopedRepositoryContext) =>
  eq(archiveObjects.schoolId, ctx.tenant.schoolId);

export async function insertArchiveObject(
  ctx: ScopedRepositoryContext,
  row: NewArchiveObject
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db.insert(archiveObjects).values(row);
  }, "insertArchiveObject");
}

export async function insertArchiveObjects(
  ctx: ScopedRepositoryContext,
  rows: readonly NewArchiveObject[]
): Promise<void> {
  await withErrorHandling(async () => {
    if (rows.length === 0) return;
    await batchOrThrow(ctx.db, chunkedInsert(ctx.db, archiveObjects, rows, 1));
  }, "insertArchiveObjects");
}

export async function findArchiveObjectByKey(
  ctx: ScopedRepositoryContext,
  objectKey: string
): Promise<ArchiveObjectRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(archiveObjects)
      .where(and(eq(archiveObjects.objectKey, objectKey), scoped(ctx)))
      .limit(1);
    return row ?? null;
  }, "findArchiveObjectByKey");
}

export async function findArchiveObjectById(
  ctx: ScopedRepositoryContext,
  id: number
): Promise<ArchiveObjectRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(archiveObjects)
      .where(and(eq(archiveObjects.id, id), scoped(ctx)))
      .limit(1);
    return row ?? null;
  }, "findArchiveObjectById");
}

export async function findLatestArchiveObject(
  ctx: ScopedRepositoryContext,
  params: {
    readonly academicId: number;
    readonly studentId: number;
    readonly examTypeId: number;
    readonly statuses: readonly ArchiveObjectStatus[];
  }
): Promise<ArchiveObjectRow | null> {
  return withErrorHandling(async () => {
    const statusPredicates = chunkedInArray(archiveObjects.status, params.statuses);
    const statusFilter = statusPredicates.length === 0 ? undefined : or(...statusPredicates);
    const [row] = await ctx.db
      .select()
      .from(archiveObjects)
      .where(
        and(
          scoped(ctx),
          eq(archiveObjects.academicId, params.academicId),
          eq(archiveObjects.studentId, params.studentId),
          eq(archiveObjects.examTypeId, params.examTypeId),
          statusFilter
        )
      )
      .orderBy(desc(archiveObjects.version))
      .limit(1);
    return row ?? null;
  }, "findLatestArchiveObject");
}

export async function listArchiveObjectsForStudent(
  ctx: ScopedRepositoryContext,
  params: { readonly academicId: number; readonly studentId: number }
): Promise<readonly ArchiveObjectRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(archiveObjects)
        .where(
          and(
            scoped(ctx),
            eq(archiveObjects.academicId, params.academicId),
            eq(archiveObjects.studentId, params.studentId)
          )
        )
        .orderBy(desc(archiveObjects.version)),
    "listArchiveObjectsForStudent"
  );
}

export async function listArchiveObjectsForSession(
  ctx: ScopedRepositoryContext,
  params: {
    readonly academicId: number;
    readonly afterStudentId?: number;
    readonly limit: number;
  }
): Promise<readonly ArchiveObjectRow[]> {
  return withErrorHandling(async () => {
    const after =
      params.afterStudentId === undefined
        ? undefined
        : sql`${archiveObjects.studentId} > ${params.afterStudentId}`;
    return ctx.db
      .select()
      .from(archiveObjects)
      .where(and(scoped(ctx), eq(archiveObjects.academicId, params.academicId), after))
      .orderBy(asc(archiveObjects.studentId), asc(archiveObjects.version))
      .limit(params.limit);
  }, "listArchiveObjectsForSession");
}

export async function listArchiveObjectVersions(
  ctx: ScopedRepositoryContext,
  params: {
    readonly academicId: number;
    readonly studentId: number;
    readonly examTypeId: number;
    readonly statuses: readonly ArchiveObjectStatus[];
  }
): Promise<readonly ArchiveObjectRow[]> {
  return withErrorHandling(async () => {
    const statusPredicates = chunkedInArray(archiveObjects.status, params.statuses);
    const statusFilter = statusPredicates.length === 0 ? undefined : or(...statusPredicates);
    return ctx.db
      .select()
      .from(archiveObjects)
      .where(
        and(
          scoped(ctx),
          eq(archiveObjects.academicId, params.academicId),
          eq(archiveObjects.studentId, params.studentId),
          eq(archiveObjects.examTypeId, params.examTypeId),
          statusFilter
        )
      )
      .orderBy(desc(archiveObjects.version));
  }, "listArchiveObjectVersions");
}

export async function listArchiveObjectsBySessions(
  ctx: ScopedRepositoryContext,
  academicIds: readonly number[]
): Promise<readonly ArchiveObjectRow[]> {
  return withErrorHandling(async () => {
    const predicates = chunkedInArray(archiveObjects.academicId, academicIds);
    if (predicates.length === 0) return [];
    return ctx.db
      .select()
      .from(archiveObjects)
      .where(and(scoped(ctx), or(...predicates)))
      .orderBy(asc(archiveObjects.academicId), asc(archiveObjects.studentId));
  }, "listArchiveObjectsBySessions");
}

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

export async function countArchiveObjectsForSession(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ value: sql<number>`count(*)` })
      .from(archiveObjects)
      .where(and(scoped(ctx), eq(archiveObjects.academicId, academicId)));
    return Number(row?.value ?? 0);
  }, "countArchiveObjectsForSession");
}

export async function sumArchiveObjectBytesForSession(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ value: sql<number>`coalesce(sum(${archiveObjects.bytes}), 0)` })
      .from(archiveObjects)
      .where(and(scoped(ctx), eq(archiveObjects.academicId, academicId)));
    return Number(row?.value ?? 0);
  }, "sumArchiveObjectBytesForSession");
}

export async function nextArchiveVersion(
  ctx: ScopedRepositoryContext,
  params: { readonly academicId: number; readonly studentId: number }
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ version: max(archiveObjects.version) })
      .from(archiveObjects)
      .where(
        and(
          scoped(ctx),
          eq(archiveObjects.academicId, params.academicId),
          eq(archiveObjects.studentId, params.studentId)
        )
      );
    return Number(row?.version ?? 0) + 1;
  }, "nextArchiveVersion");
}

export async function updateArchiveObjectStatus(
  ctx: ScopedRepositoryContext,
  params: {
    readonly id: number;
    readonly status: ArchiveObjectStatus;
    readonly publishedAt?: number | null;
    readonly publishedBy?: number | null;
    readonly reason?: string | null;
    readonly error?: string | null;
  }
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(archiveObjects)
      .set({
        status: params.status,
        ...(params.publishedAt === undefined ? {} : { publishedAt: params.publishedAt }),
        ...(params.publishedBy === undefined ? {} : { publishedBy: params.publishedBy }),
        ...(params.reason === undefined ? {} : { reason: params.reason }),
        ...(params.error === undefined ? {} : { error: params.error })
      })
      .where(and(eq(archiveObjects.id, params.id), scoped(ctx)));
  }, "updateArchiveObjectStatus");
}

export async function deleteArchiveObjectsForSessions(
  ctx: ScopedRepositoryContext,
  academicIds: readonly number[]
): Promise<void> {
  await withErrorHandling(async () => {
    const statements: BatchItem<"sqlite">[] = chunkedInArray(
      archiveObjects.academicId,
      academicIds
    ).map((predicate) =>
      ctx.db.delete(archiveObjects).where(and(scoped(ctx), predicate))
    );
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
