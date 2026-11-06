import { describe, expect, it } from "vitest";

import type { MarksheetAnnotation } from "../../src/lib/schema/marksheet-annotation";
import {
  validateMarksheetAnnotation,
  type ValidationContext
} from "../../src/lib/server/services/domain";

const context: ValidationContext = {
  expectedSubjects: ["BIBLE", "CLL/JP"],
  className: "K1",
  sectionName: "C",
  category: "NURSERY"
};

const marks = (values: Readonly<Record<string, number | null>>) =>
  Object.entries(values).map(([title, value]) => ({ title, value }));

const annotation = (overrides: Partial<MarksheetAnnotation> = {}): MarksheetAnnotation => ({
  student: {
    fullName: "TEST STUDENT",
    admissionNo: null,
    className: "1C",
    sectionName: null,
    category: "NURSERY",
    term: "THIRD TERM",
    academicYear: "2025/2026"
  },
  attendance: { daysOpened: 126, daysPresent: 126, daysAbsent: 0 },
  subjects: [
    { subjectCode: "BIBLE", marks: marks({ HW: 10, CA: 30, PSYCHO: 5, ORAL: 5, EXAM: 50 }), learningOutcome: null },
    { subjectCode: "CLL/JP", marks: marks({ HW: 10, CA: 30, PSYCHO: 5, ORAL: 5, EXAM: 50 }), learningOutcome: null }
  ],
  ratings: [],
  remark: null,
  ...overrides
});

describe("marksheet annotation validation", () => {
  it("accepts a complete NURSERY marksheet and recomputes totals", () => {
    const report = validateMarksheetAnnotation(annotation(), context);

    expect(report.errors).toEqual([]);
    expect(report.computed).toHaveLength(2);
    expect(report.computed[0]).toMatchObject({
      subjectCode: "BIBLE",
      totalMarks: 100,
      fullMarks: 100,
      percentage: 100,
      grade: "EXCEEDING"
    });
    expect(report.hasErrors).toBe(false);
  });

  it("reports a missing assigned subject", () => {
    const report = validateMarksheetAnnotation(
      annotation({ subjects: [annotation().subjects[0]!] }),
      context
    );
    expect(report.errors.map((issue) => issue.code)).toContain("missing_subject");
    expect(report.hasErrors).toBe(true);
  });

  it("reports a missing exam title", () => {
    const report = validateMarksheetAnnotation(
      annotation({
        subjects: [
          {
            subjectCode: "BIBLE",
            marks: marks({ HW: 10, CA: 30, ORAL: 5, EXAM: 50 }),
            learningOutcome: null
          },
          annotation().subjects[1]!
        ]
      }),
      context
    );
    expect(report.errors.map((issue) => issue.code)).toContain("missing_title");
  });

  it("rejects a blank mark instead of defaulting it to zero", () => {
    const report = validateMarksheetAnnotation(
      annotation({
        subjects: [
          { subjectCode: "BIBLE", marks: marks({ HW: 10, CA: 30, PSYCHO: null, ORAL: 5, EXAM: 50 }), learningOutcome: null },
          annotation().subjects[1]!
        ]
      }),
      context
    );
    expect(report.errors.map((issue) => issue.code)).toContain("blank_mark");
  });

  it("rejects a mark above the configured maximum", () => {
    const report = validateMarksheetAnnotation(
      annotation({
        subjects: [
          { subjectCode: "BIBLE", marks: marks({ HW: 10, CA: 31, PSYCHO: 5, ORAL: 5, EXAM: 50 }), learningOutcome: null },
          annotation().subjects[1]!
        ]
      }),
      context
    );
    expect(report.errors.map((issue) => issue.code)).toContain("mark_out_of_range");
  });

  it("rejects inconsistent attendance", () => {
    const report = validateMarksheetAnnotation(
      annotation({ attendance: { daysOpened: 126, daysPresent: 125, daysAbsent: 0 } }),
      context
    );
    expect(report.errors.map((issue) => issue.code)).toContain("attendance_mismatch");
  });

  it("rejects duplicate subjects", () => {
    const first = annotation().subjects[0]!;
    const report = validateMarksheetAnnotation(
      annotation({ subjects: [first, first] }),
      context
    );
    expect(report.errors.map((issue) => issue.code)).toContain("duplicate_subject");
  });

  it("requires a learning outcome for DAYCARE", () => {
    const report = validateMarksheetAnnotation(
      annotation({
        student: { ...annotation().student, category: "DAYCARE" },
        subjects: [{ subjectCode: "PSRN", marks: [], learningOutcome: null }]
      }),
      { ...context, expectedSubjects: ["PSRN"], category: "DAYCARE" }
    );
    expect(report.errors.map((issue) => issue.code)).toContain("missing_learning_outcome");
  });
});
