import { and, asc, eq, sql } from "drizzle-orm";

import { promotionBatches, promotionOutcomes } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type PromotionBatchRow = typeof promotionBatches.$inferSelect;
export type PromotionOutcomeRow = typeof promotionOutcomes.$inferSelect;
export type PromotionOutcome = "promoted" | "graduated" | "repeated" | "withdrawn" | "quarantined";

export interface NewBatchInput {
  readonly schoolId: number;
  readonly academicId: number;
  readonly fromClassId: number | null;
  readonly toClassId: number | null;
  readonly studentCount: number;
}

export interface BatchUpdate {
  readonly status?: "pending" | "running" | "completed" | "failed" | "reversed";
  readonly studentCount?: number;
  readonly promotedCount?: number;
  readonly quarantinedCount?: number;
  readonly startedAt?: number | null;
  readonly finishedAt?: number | null;
}

export async function insertBatch(
  ctx: ScopedRepositoryContext,
  input: NewBatchInput
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .insert(promotionBatches)
      .values({
        schoolId: ctx.tenant.schoolId,
        academicId: input.academicId,
        fromClassId: input.fromClassId,
        toClassId: input.toClassId,
        status: "pending",
        studentCount: input.studentCount,
        promotedCount: 0,
        quarantinedCount: 0,
        createdAt: Math.floor(Date.now() / 1000)
      })
      .returning({ id: promotionBatches.id });
    if (row === undefined) throw new Error("Insert into promotion_batches returned no row");
    return row.id;
  }, "insertBatch");
}

export async function updateBatch(
  ctx: ScopedRepositoryContext,
  batchId: number,
  update: BatchUpdate
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(promotionBatches)
      .set(update)
      .where(
        and(
          eq(promotionBatches.id, batchId),
          eq(promotionBatches.schoolId, ctx.tenant.schoolId)
        )
      );
  }, "updateBatch");
}

export async function findBatch(
  ctx: ScopedRepositoryContext,
  batchId: number
): Promise<PromotionBatchRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(promotionBatches)
      .where(
        and(
          eq(promotionBatches.id, batchId),
          eq(promotionBatches.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findBatch");
}

export async function listBatches(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<readonly PromotionBatchRow[]> {
  return withErrorHandling(async () => {
    return ctx.db
      .select()
      .from(promotionBatches)
      .where(
        and(
          eq(promotionBatches.schoolId, ctx.tenant.schoolId),
          eq(promotionBatches.academicId, academicId)
        )
      )
      .orderBy(asc(promotionBatches.id));
  }, "listBatches");
}

export async function findOutcome(
  ctx: ScopedRepositoryContext,
  batchId: number,
  studentId: number
): Promise<PromotionOutcomeRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(promotionOutcomes)
      .where(
        and(
          eq(promotionOutcomes.batchId, batchId),
          eq(promotionOutcomes.studentId, studentId),
          eq(promotionOutcomes.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findOutcome");
}

export async function insertOutcome(
  ctx: ScopedRepositoryContext,
  input: {
    readonly batchId: number;
    readonly studentId: number;
    readonly fromRecordId: number | null;
    readonly toRecordId: number | null;
    readonly outcome: PromotionOutcome;
    readonly reason: string | null;
  }
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db.insert(promotionOutcomes).values({
      schoolId: ctx.tenant.schoolId,
      batchId: input.batchId,
      studentId: input.studentId,
      fromRecordId: input.fromRecordId,
      toRecordId: input.toRecordId,
      outcome: input.outcome,
      reason: input.reason,
      createdAt: Math.floor(Date.now() / 1000)
    });
  }, "insertOutcome");
}

export async function listOutcomesForBatch(
  ctx: ScopedRepositoryContext,
  batchId: number
): Promise<readonly PromotionOutcomeRow[]> {
  return withErrorHandling(async () => {
    return ctx.db
      .select()
      .from(promotionOutcomes)
      .where(
        and(
          eq(promotionOutcomes.batchId, batchId),
          eq(promotionOutcomes.schoolId, ctx.tenant.schoolId)
        )
      )
      .orderBy(asc(promotionOutcomes.id));
  }, "listOutcomesForBatch");
}

export async function laterBatchDepends(
  ctx: ScopedRepositoryContext,
  academicId: number,
  batchId: number,
  toClassId: number | null
): Promise<boolean> {
  if (toClassId === null) return false;
  return withErrorHandling(async () => {
    const row = await ctx.db.get<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM promotion_batches
      WHERE school_id = ${ctx.tenant.schoolId}
        AND academic_id = ${academicId}
        AND id > ${batchId}
        AND from_class_id = ${toClassId}
        AND status = 'completed'
    `);
    return Number(row?.count ?? 0) > 0;
  }, "laterBatchDepends");
}

export async function countOutcomes(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<Readonly<Record<PromotionOutcome, number>>> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({ outcome: promotionOutcomes.outcome, count: sql<number>`count(*)` })
      .from(promotionOutcomes)
      .innerJoin(promotionBatches, eq(promotionOutcomes.batchId, promotionBatches.id))
      .where(
        and(
          eq(promotionOutcomes.schoolId, ctx.tenant.schoolId),
          eq(promotionBatches.academicId, academicId)
        )
      )
      .groupBy(promotionOutcomes.outcome);
    const result: Record<PromotionOutcome, number> = {
      promoted: 0,
      graduated: 0,
      repeated: 0,
      withdrawn: 0,
      quarantined: 0
    };
    for (const row of rows) result[row.outcome] = Number(row.count);
    return result;
  }, "countOutcomes");
}
