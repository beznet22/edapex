import { describe, expect, it } from "vitest";

import {
  examSetupKey,
  planMarks,
  type MarksPlanInput
} from "../../src/lib/server/services/domain";

const student = {
  studentId: 14,
  recordId: 15,
  classId: 9,
  sectionId: 10,
  schoolId: 1,
  academicId: 3,
  examTypeId: 16
};

const assignments = [{ subjectId: 11, teacherId: 12 }];

const setups = (subjectId: number, titles: readonly string[]): ReadonlyMap<string, number> =>
  new Map(titles.map((title, index) => [examSetupKey(subjectId, title), 200 + index]));

const baseInput = (overrides: Partial<MarksPlanInput> = {}): MarksPlanInput => ({
  student,
  category: "NURSERY",
  markStore: [
    {
      subjectId: 11,
      marks: { HW: 10, CA: 30, PSYCHO: 5, ORAL: 5, EXAM: 50 }
    }
  ],
  assignments,
  exams: new Map([[11, 101]]),
  examSetups: setups(11, ["HW", "CA", "PSYCHO", "ORAL", "EXAM"]),
  ...overrides
});

describe("marks planner", () => {
  it("plans named marks, results and the marks input", () => {
    const plan = planMarks(baseInput());
    expect(plan).not.toBeNull();
    if (plan === null) return;

    expect(plan.missingExams).toEqual([]);
    expect(plan.missingSetups).toEqual([]);
    expect(plan.marks).toHaveLength(5);
    expect(plan.results).toHaveLength(1);
    expect(plan.results[0]).toMatchObject({ subjectId: 11, totalMarks: 100, examId: 101 });
    expect(plan.marksInput[0]).toMatchObject({
      subjectId: 11,
      totalMarks: 100,
      fullMarks: 100,
      percentage: 100,
      grade: "EXCEEDING"
    });
  });

  it("is order-independent because marks are named", () => {
    const plan = planMarks(
      baseInput({
        markStore: [{ subjectId: 11, marks: { EXAM: 50, HW: 10 } }],
        examSetups: setups(11, ["EXAM", "HW"])
      })
    );
    expect(plan?.marksInput[0]).toMatchObject({ totalMarks: 60, fullMarks: 60 });
  });

  it("reports missing exam setups without emitting a partial write", () => {
    const plan = planMarks(
      baseInput({
        examSetups: setups(11, ["HW", "CA", "ORAL", "EXAM"])
      })
    );
    expect(plan?.missingSetups).toEqual([{ subjectId: 11, title: "PSYCHO", fullMarks: 5 }]);
    expect(plan?.marks).toEqual([]);
    expect(plan?.results).toEqual([]);
  });

  it("reports a missing exam and skips the subject", () => {
    const plan = planMarks(baseInput({ exams: new Map() }));
    expect(plan?.missingExams).toEqual([{ subjectId: 11 }]);
    expect(plan?.marks).toEqual([]);
  });

  it("handles DAYCARE with a learning outcome and no numeric marks", () => {
    const plan = planMarks(
      baseInput({
        category: "DAYCARE",
        markStore: [
          {
            subjectId: 11,
            marks: {},
            learningOutcome: "Learns through play"
          }
        ],
        exams: new Map([[11, 101]]),
        examSetups: new Map()
      })
    );
    expect(plan?.marks).toEqual([]);
    expect(plan?.results[0]).toMatchObject({
      totalMarks: 0,
      teacherRemarks: "Learns through play"
    });
    expect(plan?.marksInput[0]).toMatchObject({
      fullMarks: 0,
      percentage: 0,
      teacherRemarks: "Learns through play"
    });
  });

  it("returns null when the placement is incomplete", () => {
    expect(
      planMarks(
        baseInput({
          student: { ...student, classId: 0 }
        })
      )
    ).toBeNull();
  });
});
