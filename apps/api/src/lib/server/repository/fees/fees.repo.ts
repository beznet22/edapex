import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { smFeesAssigns, smFeesMasters } from "../../db/schema";
import { batchOrThrow, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type FeeMasterRow = typeof smFeesMasters.$inferSelect;

export interface AssignFeesParams {
  readonly studentId: number;
  readonly recordId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly academicId: number;
  readonly masters: readonly FeeMasterRow[];
  readonly createdBy: number;
}

export async function listFeeMastersByClass(
  ctx: ScopedRepositoryContext,
  classId: number,
  academicId: number
): Promise<readonly FeeMasterRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(smFeesMasters)
        .where(
          and(
            eq(smFeesMasters.schoolId, ctx.tenant.schoolId),
            eq(smFeesMasters.academicId, academicId),
            eq(smFeesMasters.classId, classId),
            eq(smFeesMasters.activeStatus, 1)
          )
        ),
    "listFeeMastersByClass"
  );
}

/**
 * Removes any prior assignments for the new record, then inserts one row per
 * active fee master. Both statements share one D1 batch, so a retry cannot
 * leave a partial fee set.
 */
export async function assignFeesToStudent(
  ctx: ScopedRepositoryContext,
  params: AssignFeesParams,
  now: number = Math.floor(Date.now() / 1000)
): Promise<number> {
  return withErrorHandling(async () => {
    const statements: BatchItem<"sqlite">[] = [
      ctx.db
        .delete(smFeesAssigns)
        .where(
          and(
            eq(smFeesAssigns.recordId, params.recordId),
            eq(smFeesAssigns.schoolId, ctx.tenant.schoolId)
          )
        )
    ];

    const rows = params.masters.map((master) => ({
      studentId: params.studentId,
      recordId: params.recordId,
      feesMasterId: master.id,
      feesAmount: master.amount ?? 0,
      appliedDiscount: 0,
      academicId: params.academicId,
      schoolId: ctx.tenant.schoolId,
      classId: params.classId,
      sectionId: params.sectionId,
      createdBy: params.createdBy,
      activeStatus: 1,
      createdAt: now,
      updatedAt: now
    }));

    statements.push(...chunkedInsert(ctx.db, smFeesAssigns, rows, 12));
    await batchOrThrow(ctx.db, statements);
    return rows.length;
  }, "assignFeesToStudent");
}

export async function deleteFeeAssignmentsForRecord(
  ctx: ScopedRepositoryContext,
  recordId: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .delete(smFeesAssigns)
        .where(
          and(
            eq(smFeesAssigns.recordId, recordId),
            eq(smFeesAssigns.schoolId, ctx.tenant.schoolId)
          )
        );
    },
    "deleteFeeAssignmentsForRecord"
  );
}
