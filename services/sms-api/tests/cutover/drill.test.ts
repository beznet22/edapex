import { describe, expect, it } from "vitest";

import {
  DrillError,
  assertCoreCountsUnchanged,
  compareCounts,
  expectStatus,
  expectTrue,
  normalizeCategory,
  pickCounts
} from "../../scripts/cutover/drill-assertions.mjs";

describe("drill assertions", () => {
  it("normalizes category labels", () => {
    expect(normalizeCategory("MIDDLE BASIC")).toBe("MIDDLEBASIC");
    expect(normalizeCategory("Grade K")).toBe("GRADEK");
    expect(normalizeCategory("upper-basic")).toBe("UPPERBASIC");
    expect(normalizeCategory(null)).toBe("");
  });

  it("checks HTTP statuses with a useful label", () => {
    expect(() => expectStatus({ status: 200, text: "ok" }, 200, "health")).not.toThrow();
    expect(() => expectStatus({ status: 404, text: "missing" }, 200, "integrity")).toThrow(
      /integrity: expected 200, got 404/
    );
  });

  it("checks truthiness", () => {
    expect(() => expectTrue(true, "ok")).not.toThrow();
    expect(() => expectTrue(false, "gate failed")).toThrow(DrillError);
  });

  it("compares core counts and reports changed or missing tables", () => {
    const before = { sm_students: 10, student_records: 10, sm_classes: 5 };
    const after = { sm_students: 10, student_records: 11, sm_classes: 5 };
    expect(compareCounts(before, after, new Set())).toEqual({
      changed: ["student_records"],
      missing: []
    });
    expect(compareCounts(before, { sm_students: 10, sm_classes: 5 }, new Set())).toEqual({
      changed: [],
      missing: ["student_records"]
    });
    expect(
      compareCounts(before, after, new Set(["student_records"]))
    ).toEqual({ changed: [], missing: [] });
    expect(() =>
      assertCoreCountsUnchanged(before, after, new Set())
    ).toThrow(/student_records/);
    expect(() =>
      assertCoreCountsUnchanged(before, after, new Set(["student_records"]))
    ).not.toThrow();
  });

  it("picks required counts", () => {
    expect(pickCounts({ a: 1, b: 2 }, ["a", "b"])).toEqual({ a: 1, b: 2 });
    expect(() => pickCounts({ a: 1 }, ["a", "b"])).toThrow(/b/);
  });
});
