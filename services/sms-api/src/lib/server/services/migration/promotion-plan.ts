export interface PromotionPlanRow {
  readonly classId: number;
  readonly className: string;
  readonly nextClassId: number | null;
  readonly sortOrder: number | null;
  readonly studentCount: number;
}

export interface PromotionBatchPlan extends PromotionPlanRow {
  readonly toClassId: number;
  readonly daycare: boolean;
}

export interface PromotionPlan {
  readonly batches: readonly PromotionBatchPlan[];
  readonly unplaced: readonly PromotionPlanRow[];
  readonly totals: {
    readonly promoted: number;
    readonly daycare: number;
    readonly unplaced: number;
    readonly targetRecords: number;
  };
}

/**
 * Pure ladder planner. Descending class order so a destination is never
 * populated before its own cohort moves; DAYCARE runs last. Classes with a
 * null `next_class_id` are reported under UNPLACED, not promoted.
 */
export function buildPromotionPlan(rows: readonly PromotionPlanRow[]): PromotionPlan {
  const withNext = rows
    .filter((row): row is PromotionPlanRow & { nextClassId: number } => row.nextClassId !== null)
    .sort((left, right) => {
      if (left.className === "DAYCARE") return 1;
      if (right.className === "DAYCARE") return -1;
      return (right.sortOrder ?? 0) - (left.sortOrder ?? 0);
    });
  const batches: PromotionBatchPlan[] = withNext.map((row) => ({
    ...row,
    toClassId: row.nextClassId,
    daycare: row.className === "DAYCARE"
  }));
  const unplaced = rows.filter((row) => row.nextClassId === null);
  const daycare = batches
    .filter((batch) => batch.daycare)
    .reduce((sum, batch) => sum + batch.studentCount, 0);
  const promoted = batches
    .filter((batch) => !batch.daycare)
    .reduce((sum, batch) => sum + batch.studentCount, 0);
  const unplacedCount = unplaced.reduce((sum, row) => sum + row.studentCount, 0);
  return {
    batches,
    unplaced,
    totals: {
      promoted,
      daycare,
      unplaced: unplacedCount,
      targetRecords: promoted + daycare
    }
  };
}
