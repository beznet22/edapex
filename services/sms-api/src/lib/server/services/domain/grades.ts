import type { AssessmentCategory } from "../../../constants/assessment";

export const GRADE_RANGES = {
  EYFS: [
    { min: 0, max: 80, grade: "EMERGING", color: "bg-purple-200" },
    { min: 81, max: 90, grade: "EXPECTED", color: "bg-blue-200" },
    { min: 91, max: 100, grade: "EXCEEDING", color: "bg-red-200" }
  ],
  GRADERS: [
    { min: 0, max: 69, grade: "E", color: "bg-red-200" },
    { min: 70, max: 76, grade: "D", color: "bg-orange-200" },
    { min: 77, max: 85, grade: "C", color: "bg-yellow-200" },
    { min: 86, max: 93, grade: "B", color: "bg-blue-200" },
    { min: 94, max: 100, grade: "A", color: "bg-purple-200" }
  ]
} as const;

export interface ClassResult {
  readonly studentId: number;
  readonly totalMarks: number | null;
}

export interface ClassAverageEntry {
  readonly studentId: number;
  readonly value: string;
}

export interface ClassAverage {
  readonly min: ClassAverageEntry;
  readonly max: ClassAverageEntry;
}

export function subjectPercentageMark(obtainedMark: number, fullMark: number): number {
  if (fullMark === 0) return 0;
  return Math.round((obtainedMark / fullMark) * 10000) / 100;
}

export function getGrade(
  score: number,
  category: AssessmentCategory
): { readonly grade: string; readonly color: string } {
  const ranges =
    category === "LOWERBASIC" || category === "MIDDLEBASIC"
      ? GRADE_RANGES.GRADERS
      : GRADE_RANGES.EYFS;
  const match = ranges.find((range) => score >= range.min && score <= range.max);
  return match ? { grade: match.grade, color: match.color } : { grade: "N/A", color: "bg-gray-200" };
}

/**
 * Class averages exclude students whose result is unassessed (`06 §4`): a
 * missing mark is not a zero, so it must not drag the minimum down.
 */
export function computeClassAverages(results: readonly ClassResult[]): ClassAverage {
  const byStudent = new Map<number, number[]>();
  for (const result of results) {
    if (result.totalMarks === null) continue;
    const values = byStudent.get(result.studentId) ?? [];
    values.push(result.totalMarks);
    byStudent.set(result.studentId, values);
  }

  const averages = [...byStudent.entries()].map(([studentId, marks]) => {
    const total = marks.reduce((sum, mark) => sum + mark, 0);
    return { studentId, average: marks.length > 0 ? Math.fround(total / marks.length) : 0 };
  });

  if (averages.length === 0) {
    return { min: { studentId: 0, value: "0.00" }, max: { studentId: 0, value: "0.00" } };
  }

  const minAverage = Math.min(...averages.map((entry) => entry.average));
  const maxAverage = Math.max(...averages.map((entry) => entry.average));
  const minStudent = averages.find((entry) => entry.average === minAverage) ?? averages[0];
  const maxStudent = averages.find((entry) => entry.average === maxAverage) ?? averages[0];

  return {
    min: { studentId: minStudent?.studentId ?? 0, value: minAverage.toFixed(0) },
    max: { studentId: maxStudent?.studentId ?? 0, value: maxAverage.toFixed(0) }
  };
}
