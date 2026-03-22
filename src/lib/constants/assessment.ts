export enum AttributeEnum {
    Poor = 1,
    Fair,
    Good,
    VeryGood,
    Excellent,
}

export const AttributeRemark = {
    1: "Poor",
    2: "Fair",
    3: "Good",
    4: "Very Good",
    5: "Excellent",
} as const;

/**
 * Maximum marks per exam title, keyed by student category.
 * DAYCARE is excluded — it uses text-based learning outcomes, not numeric marks.
 */
export const EXAM_MARK_MAXIMUMS: Record<string, Record<string, number>> = {
    NURSERY:     { CA: 30, ORAL: 5, PSYCHO: 5, HOMEWORK: 10, EXAM: 50 },
    GRADEK:      { CA1: 20, CA2: 20, HOMEWORK: 2, REPORT: 4, PSYCHO: 4, EXAM: 50 },
    LOWERBASIC:  { MTA: 30, CA: 10, REPORT: 10, EXAM: 50 },
    MIDDLEBASIC: { MTA: 30, CA: 10, REPORT: 10, EXAM: 50 },
};
