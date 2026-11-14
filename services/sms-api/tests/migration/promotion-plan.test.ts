import { describe, expect, it } from "vitest";

import { buildPromotionPlan } from "../../src/lib/server/services/migration/promotion-plan";

describe("promotion ladder planner", () => {
  it("orders descending, keeps DAYCARE last and reports null next classes", () => {
    const plan = buildPromotionPlan([
      { classId: 12, className: "CRECHE", nextClassId: 13, sortOrder: 12, studentCount: 53 },
      { classId: 16, className: "DAYCARE", nextClassId: 26, sortOrder: 16, studentCount: 24 },
      { classId: 22, className: "MIDDLE BASIC 6", nextClassId: 34, sortOrder: 22, studentCount: 18 },
      { classId: 1, className: "GRADE 1", nextClassId: null, sortOrder: 1, studentCount: 3 }
    ]);
    expect(plan.batches.map((batch) => batch.className)).toEqual([
      "MIDDLE BASIC 6",
      "CRECHE",
      "DAYCARE"
    ]);
    expect(plan.batches[plan.batches.length - 1]?.daycare).toBe(true);
    expect(plan.unplaced).toHaveLength(1);
    expect(plan.totals).toEqual({
      promoted: 71,
      daycare: 24,
      unplaced: 3,
      targetRecords: 95
    });
  });
});
