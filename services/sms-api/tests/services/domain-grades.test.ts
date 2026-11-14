import { describe, expect, it } from "vitest";

import {
  computeClassAverages,
  getGrade,
  subjectPercentageMark
} from "../../src/lib/server/services/domain";

describe("grade helpers", () => {
  it("computes percentages and handles a zero full-mark denominator", () => {
    expect(subjectPercentageMark(30, 50)).toBe(60);
    expect(subjectPercentageMark(1, 3)).toBe(33.33);
    expect(subjectPercentageMark(10, 0)).toBe(0);
  });

  it("uses EYFS bands for early years and grader bands for basic education", () => {
    expect(getGrade(85, "NURSERY").grade).toBe("EXPECTED");
    expect(getGrade(95, "NURSERY").grade).toBe("EXCEEDING");
    expect(getGrade(80, "LOWERBASIC").grade).toBe("C");
    expect(getGrade(95, "MIDDLEBASIC").grade).toBe("A");
    expect(getGrade(101, "GRADEK").grade).toBe("N/A");
  });

  it("computes min and max class averages with legacy rounding", () => {
    const result = computeClassAverages([
      { studentId: 1, totalMarks: 10 },
      { studentId: 1, totalMarks: 20 },
      { studentId: 2, totalMarks: 90 },
      { studentId: 2, totalMarks: 70 }
    ]);

    expect(result.min).toEqual({ studentId: 1, value: "15" });
    expect(result.max).toEqual({ studentId: 2, value: "80" });
  });

  it("returns the zero shape for an empty class", () => {
    expect(computeClassAverages([])).toEqual({
      min: { studentId: 0, value: "0.00" },
      max: { studentId: 0, value: "0.00" }
    });
  });
});
