import { describe, expect, it } from "vitest";

import {
  marksheetAnnotationJsonSchema,
  marksheetAnnotationSchema
} from "../../src/lib/schema/marksheet-annotation";

const validAnnotation = {
  student: {
    fullName: "TEST STUDENT",
    admissionNo: null,
    className: "1C",
    sectionName: null,
    category: "NURSERY" as const,
    term: "THIRD TERM",
    academicYear: "2025/2026"
  },
  attendance: { daysOpened: 126, daysPresent: 126, daysAbsent: 0 },
  subjects: [
    {
      subjectCode: "BIBLE",
      marks: [
        { title: "HW", value: 10 },
        { title: "CA", value: 30 },
        { title: "PSYCHO", value: 5 },
        { title: "ORAL", value: 5 },
        { title: "EXAM", value: 50 }
      ],
      learningOutcome: null
    }
  ],
  ratings: [],
  remark: null
};

describe("marksheet annotation schema", () => {
  it("parses a blank-admission NURSERY annotation", () => {
    const parsed = marksheetAnnotationSchema.parse(validAnnotation);
    expect(parsed.student.admissionNo).toBeNull();
    expect(parsed.subjects[0]?.marks).toHaveLength(5);
  });

  it("rejects an unknown category and a negative mark", () => {
    expect(() =>
      marksheetAnnotationSchema.parse({
        ...validAnnotation,
        student: { ...validAnnotation.student, category: "UNKNOWN" }
      })
    ).toThrow();

    expect(() =>
      marksheetAnnotationSchema.parse({
        ...validAnnotation,
        subjects: [
          {
            subjectCode: "BIBLE",
            marks: [{ title: "HW", value: -1 }],
            learningOutcome: null
          }
        ]
      })
    ).toThrow();
  });

  it("converts to a provider-ready JSON schema with named marks", () => {
    const jsonSchema = marksheetAnnotationJsonSchema();
    expect(jsonSchema["type"]).toBe("object");
    const properties = jsonSchema["properties"];
    expect(properties).toBeDefined();
    if (typeof properties === "object" && properties !== null) {
      expect("student" in properties).toBe(true);
      expect("subjects" in properties).toBe(true);
    }
  });
});
