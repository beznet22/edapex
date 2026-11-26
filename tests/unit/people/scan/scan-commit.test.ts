import { describe, expect, it } from "vitest";
import { validateForCommit } from "$lib/server/people/scan/scan-commit";
import type { Marksheet } from "$lib/schema/marksheet";

const record = (overrides: Partial<Marksheet["records"][number]> = {}) => ({
  studentId: 900,
  resultId: 0,
  subjectId: 11,
  subject: "MATH",
  subjectCode: "MATH",
  objectives: null,
  titleIds: [],
  titles: ["MTA", "CA", "REPORT", "EXAM"],
  markIds: [],
  marks: [20, 8, 10, 48],
  fullMarks: [30, 10, 10, 50],
  totalScore: 86,
  grade: "B",
  color: "bg-blue-200",
  category: "LOWERBASIC" as const,
  ...overrides,
});

const marksheet = (records: Marksheet["records"]): Marksheet => ({
  school: {
    id: 1,
    name: "Lighthouse",
    email: "a@b.c",
    phone: "000",
    city: "",
    state: "",
    title: "TERMLY",
    vacation_date: "",
  },
  student: {
    id: 900,
    examTypeId: 5,
    fullName: "LUTER PRAISE",
    gender: "1",
    parentEmail: "p@b.c",
    parentName: "Parent",
    term: "2025/2026",
    title: "TERMLY",
    category: "LOWERBASIC",
    className: "LOWER BASIC 1",
    sectionName: "C",
    adminNo: 119,
    sessionYear: "2025/2026",
    daysOpened: 102,
    daysPresent: 96,
    daysAbsent: 6,
    token: "tok",
  },
  subjects: [{ subjectId: 11, subjectCode: "MATH", teacherId: null }],
  records,
  ratings: [],
  remark: { remark: "Good progress" },
});

describe("validateForCommit", () => {
  const assigned = [11, 12, 25, 28];

  it("accepts a well-formed marksheet", async () => {
    const errors = await validateForCommit({
      marksheet: marksheet([record()]),
      category: "LOWERBASIC",
      assignedSubjectIds: assigned,
    });
    expect(errors).toEqual([]);
  });

  it("rejects an unresolved subject id", async () => {
    const errors = await validateForCommit({
      marksheet: marksheet([record({ subjectId: 0, subjectCode: "ASTRONOMY" })]),
      category: "LOWERBASIC",
      assignedSubjectIds: assigned,
    });
    expect(errors).toContain("ASTRONOMY: subject is not resolved");
  });

  it("rejects a subject that is no longer assigned to the class", async () => {
    const errors = await validateForCommit({
      marksheet: marksheet([record({ subjectId: 77 })]),
      category: "LOWERBASIC",
      assignedSubjectIds: assigned,
    });
    expect(errors[0]).toMatch(/not assigned to this class/);
  });

  it("rejects a mark above the category maximum", async () => {
    const errors = await validateForCommit({
      marksheet: marksheet([record({ marks: [20, 40, 10, 48] })]),
      category: "LOWERBASIC",
      assignedSubjectIds: assigned,
    });
    expect(errors).toContain("MATH CA: 40 exceeds the maximum of 10");
  });

  it("rejects a marks/titles length mismatch", async () => {
    const errors = await validateForCommit({
      marksheet: marksheet([record({ marks: [20, 8] })]),
      category: "LOWERBASIC",
      assignedSubjectIds: assigned,
    });
    expect(errors).toContain("MATH: 2 marks for 4 columns");
  });

  it("rejects a negative or non-integer mark", async () => {
    const errors = await validateForCommit({
      marksheet: marksheet([record({ marks: [20, -1, 10, 48] })]),
      category: "LOWERBASIC",
      assignedSubjectIds: assigned,
    });
    expect(errors).toContain("MATH CA: invalid mark");
  });

  it("rejects an empty records array", async () => {
    const empty = marksheet([record()]);
    empty.records = [];
    const errors = await validateForCommit({
      marksheet: empty,
      category: "LOWERBASIC",
      assignedSubjectIds: assigned,
    });
    expect(errors).toContain("No subjects to save");
  });

  it("accepts a mark exactly at the maximum", async () => {
    const errors = await validateForCommit({
      marksheet: marksheet([record({ marks: [30, 10, 10, 50] })]),
      category: "LOWERBASIC",
      assignedSubjectIds: assigned,
    });
    expect(errors).toEqual([]);
  });
});
