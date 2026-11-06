import { and, eq, lt, notExists, sql } from "drizzle-orm";

import { marksheetCaptures, ocrCache } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type OcrCacheRow = typeof ocrCache.$inferSelect;
export type NewOcrCacheRow = Omit<typeof ocrCache.$inferInsert, "schoolId">;

export interface OcrCacheKey {
  readonly contentSha256: string;
  readonly parserVersion: string;
}

export async function findOcrCache(
  ctx: ScopedRepositoryContext,
  key: OcrCacheKey
): Promise<OcrCacheRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(ocrCache)
      .where(
        and(
          eq(ocrCache.schoolId, ctx.tenant.schoolId),
          eq(ocrCache.contentSha256, key.contentSha256),
          eq(ocrCache.parserVersion, key.parserVersion)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findOcrCache");
}

export async function upsertOcrCache(
  ctx: ScopedRepositoryContext,
  row: NewOcrCacheRow
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .insert(ocrCache)
        .values({ ...row, schoolId: ctx.tenant.schoolId })
        .onConflictDoUpdate({
          target: [ocrCache.schoolId, ocrCache.contentSha256, ocrCache.parserVersion],
          set: {
            fileName: row.fileName,
            mimeType: row.mimeType,
            sizeBytes: row.sizeBytes,
            pageCount: row.pageCount ?? null,
            rawText: row.rawText,
            annotationJson: row.annotationJson ?? null,
            lastUsedAt: row.lastUsedAt,
            expiresAt: row.expiresAt
          }
        });
    },
    "upsertOcrCache"
  );
}

export async function touchOcrCache(
  ctx: ScopedRepositoryContext,
  key: OcrCacheKey,
  now: number,
  expiresAt: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .update(ocrCache)
        .set({
          lastUsedAt: now,
          expiresAt,
          hitCount: sql`${ocrCache.hitCount} + 1`
        })
        .where(
          and(
            eq(ocrCache.schoolId, ctx.tenant.schoolId),
            eq(ocrCache.contentSha256, key.contentSha256),
            eq(ocrCache.parserVersion, key.parserVersion)
          )
        );
    },
    "touchOcrCache"
  );
}

/**
 * Deletes expired cache rows that no uncommitted capture depends on. A
 * committed result lives in the marksheet tables, so its cache entry may go.
 */
export async function deleteExpiredOcrCache(
  ctx: ScopedRepositoryContext,
  now: number
): Promise<number> {
  return withErrorHandling(async () => {
    const deleted = await ctx.db
      .delete(ocrCache)
      .where(
        and(
          eq(ocrCache.schoolId, ctx.tenant.schoolId),
          lt(ocrCache.expiresAt, now),
          notExists(
            ctx.db
              .select({ one: sql<number>`1` })
              .from(marksheetCaptures)
              .where(
                and(
                  eq(marksheetCaptures.schoolId, ocrCache.schoolId),
                  eq(marksheetCaptures.ocrContentSha256, ocrCache.contentSha256),
                  eq(marksheetCaptures.ocrParserVersion, ocrCache.parserVersion),
                  sql`${marksheetCaptures.status} <> 'committed'`
                )
              )
          )
        )
      )
      .returning({ contentSha256: ocrCache.contentSha256 });
    return deleted.length;
  }, "deleteExpiredOcrCache");
}
