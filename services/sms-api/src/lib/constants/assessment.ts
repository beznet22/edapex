export const CATEGORY_VALUES = [
  "DAYCARE",
  "NURSERY",
  "GRADEK",
  "LOWERBASIC",
  "MIDDLEBASIC",
  "UPPERBASIC"
] as const;

export type AssessmentCategory = (typeof CATEGORY_VALUES)[number];

/** Maximum marks per exam title, keyed by category. DAYCARE has no numeric marks. */
export const EXAM_MARK_MAXIMUMS: Record<AssessmentCategory, Record<string, number>> = {
  DAYCARE: {},
  NURSERY: { CA: 30, ORAL: 5, PSYCHO: 5, HW: 10, EXAM: 50 },
  GRADEK: { CA1: 20, CA2: 20, HW: 2, REPORT: 4, PSYCHO: 4, EXAM: 50 },
  LOWERBASIC: { MTA: 30, CA: 10, REPORT: 10, EXAM: 50 },
  MIDDLEBASIC: { MTA: 30, CA: 10, REPORT: 10, EXAM: 50 },
  UPPERBASIC: { MTA: 30, CA: 10, REPORT: 10, EXAM: 50 }
};

export const TITLES_BY_CATEGORY: Record<AssessmentCategory, readonly string[]> = {
  DAYCARE: [],
  NURSERY: ["CA", "ORAL", "PSYCHO", "HW", "EXAM"],
  GRADEK: ["CA1", "CA2", "HW", "REPORT", "PSYCHO", "EXAM"],
  LOWERBASIC: ["MTA", "CA", "REPORT", "EXAM"],
  MIDDLEBASIC: ["MTA", "CA", "REPORT", "EXAM"],
  UPPERBASIC: ["MTA", "CA", "REPORT", "EXAM"]
};

export enum AttributeEnum {
  Poor = 1,
  Fair,
  Good,
  VeryGood,
  Excellent
}

export const AttributeRemark = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent"
} as const;
