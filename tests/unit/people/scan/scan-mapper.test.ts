import { describe, expect, it } from "vitest";
import {
  buildMarksheet,
  composeMarksheet,
  composeRecords,
  gradeFor,
  mapRatings,
  matchSubjectCode,
  normaliseSubjectCode,
  type ScannerSubject,
} from "$lib/server/people/scan/scan-mapper";
import type { ScanExtraction } from "$lib/server/people/scan/scan-extraction-schema";

const candidates: ScannerSubject[] = [
  { subjectId: 11, subjectCode: "PSRN", subjectName: "Personal Social and Emotional Development" },
  { subjectId: 12, subjectCode: "JP/CLL", subjectName: "Communication and Language" },
  { subjectId: 13, subjectCode: "KUW/EAD", subjectName: "Understanding the World" },
  { subjectId: 14, subjectCode: "BASIC SCIENCE", subjectName: "Basic Science" },
  { subjectId: 15, subjectCode: "CIVIC", subjectName: "Civic Education" },
];

const extraction = (overrides: Partial<ScanExtraction> = {}): ScanExtraction => ({
  student: { fullName: "ADAKOLE", admissionNo: 921, className: "CRECHE A" },
  daysOpened: 102,
  daysPresent: 102,
  daysAbsent: 0,
  columnTitles: [
    { title: "CA", maxMark: 30 },
    { title: "ORAL", maxMark: 5 },
    { title: "PSYCHO", maxMark: 5 },
    { title: "HW", maxMark: 10 },
    { title: "EXAM", maxMark: 50 },
  ],
  records: [
    { subjectCode: "CLL/JP", marks: [24, 5, 5, 5, 50], subjectRemark: null },
    { subjectCode: "PSRN", marks: [24, 5, 5, 5, 36], subjectRemark: null },
  ],
  ratings: [],
  teacherRemark: "Doing well",
  pageConfidence: "high",
  ...overrides,
});

describe("normaliseSubjectCode", () => {
  it("treats CLL/JP and JP/CLL as the same subject", () => {
    expect(normaliseSubjectCode("CLL/JP")).toBe(normaliseSubjectCode("JP/CLL"));
  });

  it("ignores case, spacing and punctuation", () => {
    expect(normaliseSubjectCode("basic science")).toBe(normaliseSubjectCode("BASIC-SCIENCE"));
    expect(normaliseSubjectCode(" PSRN ")).toBe("PSRN");
  });

  it("keeps multi-segment codes sorted", () => {
    expect(normaliseSubjectCode("KUW/EAD/SCI")).toBe("EAD/KUW/SCI");
  });
});

describe("matchSubjectCode", () => {
  it("matches an exact code", () => {
    expect(matchSubjectCode("PSRN", candidates)).toMatchObject({ subjectId: 11, warning: null });
  });

  it("matches the reversed segment form the adakole paper prints", () => {
    expect(matchSubjectCode("CLL/JP", candidates)).toMatchObject({ subjectId: 12, warning: null });
  });

  it("never resolves a duplicate code silently", () => {
    const duplicated: ScannerSubject[] = [
      { subjectId: 21, subjectCode: "PSRN", subjectName: "Pre-School Readiness" },
      { subjectId: 22, subjectCode: "PSRN", subjectName: "Psychosocial Readiness" },
    ];
    const result = matchSubjectCode("PSRN", duplicated);
    expect(result.subjectId).toBeNull();
    expect(result.warning).toMatch(/ambiguous/i);
  });

  it("returns a warning and a null id when nothing matches", () => {
    const result = matchSubjectCode("FURTHER MATHS", candidates);
    expect(result.subjectId).toBeNull();
    expect(result.warning).toMatch(/not assigned/i);
  });

  it("does NOT fuzzy-match a partial code — CL/VR and JP/LIT are both assigned", () => {
    // Live collision: classes 15/5, 15/6 and 15/7 are assigned both CL/VR and JP/LIT. A
    // contains-match on "CL" or "JP" used to go ambiguous and block commit.
    const live: ScannerSubject[] = [
      { subjectId: 41, subjectCode: "CL/VR", subjectName: "Comprehension" },
      { subjectId: 42, subjectCode: "JP/LIT", subjectName: "Jolly Phonics Literacy" },
    ];
    expect(matchSubjectCode("CL/VR", live).subjectId).toBe(41);
    expect(matchSubjectCode("JP/LIT", live).subjectId).toBe(42);
    expect(matchSubjectCode("CL", live).subjectId).toBeNull();
    expect(matchSubjectCode("JP", live).subjectId).toBeNull();
  });

  it("does NOT fuzzy-match PSRN against PSRN/QR", () => {
    const live: ScannerSubject[] = [
      { subjectId: 51, subjectCode: "PSRN", subjectName: "Problem Solving" },
      { subjectId: 52, subjectCode: "PSRN/QR", subjectName: "Problem Solving / Quant Reasoning" },
    ];
    expect(matchSubjectCode("PSRN", live).subjectId).toBe(51);
    expect(matchSubjectCode("PSRN/QR", live).subjectId).toBe(52);
    expect(matchSubjectCode("PSYCHO", live).subjectId).toBeNull();
  });

  it("rejects a bare word that only appears inside a longer assigned code", () => {
    // The old contains-match resolved this to BASIC SCIENCE. Every assigned code in the active
    // year is printed verbatim on the paper, so a partial read means a misread, not a code.
    const result = matchSubjectCode("SCIENCE", candidates);
    expect(result.subjectId).toBeNull();
    expect(result.warning).toMatch(/not assigned/i);
  });

  it("skips candidates with a null code", () => {
    const withNull: ScannerSubject[] = [
      ...candidates,
      { subjectId: 99, subjectCode: null, subjectName: "Unnamed" },
    ];
    expect(matchSubjectCode("PSRN", withNull).subjectId).toBe(11);
  });
});

describe("composeRecords", () => {
  const base = {
    extraction: extraction(),
    category: "NURSERY" as const,
    assignedSubjects: candidates,
    studentId: 900,
    examTypeId: 2,
  };

  it("re-keys labelled columns into titles order", () => {
    const { records } = composeRecords(base);
    const cll = records.find((record) => record.subjectId === 12)!;
    expect(cll.titles).toEqual(["CA", "ORAL", "PSYCHO", "HW", "EXAM"]);
    expect(cll.marks).toEqual([24, 5, 5, 5, 50]);
    expect(cll.fullMarks).toEqual([30, 5, 5, 10, 50]);
    expect(cll.totalScore).toBe(89);
  });

  it("computes a grade from the category's ranges", () => {
    const { records } = composeRecords(base);
    // NURSERY uses the EYFS scale. 89/100 = 89% -> EXPECTED; 24+5+5+5+36 = 75/100 -> EMERGING.
    expect(records.find((record) => record.subjectId === 12)!.grade).toBe("EXPECTED");
    expect(records.find((record) => record.subjectId === 11)!.grade).toBe("EMERGING");
  });

  it("flags a mark above the per-title maximum", () => {
    const overMax = extraction({
      records: [{ subjectCode: "CLL/JP", marks: [10, 24, 5, 5, 51], subjectRemark: null }],
    });
    const { errors } = composeRecords({ ...base, extraction: overMax });
    expect(errors).toContain("CLL/JP EXAM: 51 exceeds the maximum of 50");
  });

  it("applies LOWERBASIC maximums, where CA is 10 not 30", () => {
    const lb = extraction({
      columnTitles: [
        { title: "MTA", maxMark: 30 },
        { title: "CA", maxMark: 10 },
        { title: "REPORT", maxMark: 10 },
        { title: "EXAM", maxMark: 50 },
      ],
      records: [{ subjectCode: "BASIC SCIENCE", marks: [20, 40, 10, 48], subjectRemark: null }],
    });
    const { errors } = composeRecords({ ...base, category: "LOWERBASIC", extraction: lb });
    expect(errors).toContain("BASIC SCIENCE CA: 40 exceeds the maximum of 10");
  });

  it("blocks an unresolved subject but keeps the row for editing", () => {
    const unknown = extraction({
      records: [{ subjectCode: "ASTRONOMY", marks: [10, 5, 5, 5, 50], subjectRemark: null }],
    });
    const { records, errors } = composeRecords({ ...base, extraction: unknown });
    expect(records).toHaveLength(1);
    expect(records[0].subjectId).toBe(0);
    expect(errors).toContain('Subject "ASTRONOMY" must be selected before saving');
  });

  it("flags a subject appearing twice", () => {
    const duplicated = extraction({
      records: [
        { subjectCode: "PSRN", marks: [10, 5, 5, 5, 50], subjectRemark: null },
        { subjectCode: "PSRN", marks: [10, 5, 5, 5, 40], subjectRemark: null },
      ],
    });
    const { errors } = composeRecords({ ...base, extraction: duplicated });
    expect(errors).toContain('Subject "PSRN" appears twice on the page');
  });

  it("records a blank cell as low confidence rather than a silent zero", () => {
    const blank = extraction({
      records: [{ subjectCode: "PSRN", marks: [10, null, 5, 5, 36], subjectRemark: null }],
    });
    const { lowConfidence, records } = composeRecords({ ...base, extraction: blank });
    expect(lowConfidence).toContain("PSRN ORAL: blank");
    expect(records[0].marks[1]).toBe(0);
  });

  it("warns when a printed column is outside the category scheme", () => {
    const odd = extraction({
      columnTitles: [
        { title: "CA", maxMark: 30 },
        { title: "ORAL", maxMark: 5 },
        { title: "PSYCHO", maxMark: 5 },
        { title: "HW", maxMark: 10 },
        { title: "EXAM", maxMark: 50 },
        { title: "BONUS", maxMark: 5 },
      ],
      records: [{ subjectCode: "PSRN", marks: [10, 5, 5, 5, 50, 3], subjectRemark: null }],
    });
    const { warnings } = composeRecords({ ...base, extraction: odd });
    expect(warnings).toContain('Column "BONUS" is not part of the NURSERY mark scheme');
  });

  it("only lists resolved subjects in `subjects`", () => {
    const partial = extraction({
      records: [
        { subjectCode: "PSRN", marks: [10, 5, 5, 5, 50], subjectRemark: null },
        { subjectCode: "ASTRONOMY", marks: [10, 5, 5, 5, 50], subjectRemark: null },
      ],
    });
    const { subjects } = composeRecords({ ...base, extraction: partial });
    expect(subjects).toEqual([{ subjectId: 11, subjectCode: "PSRN", teacherId: null }]);
  });

  // Regression: the live sm_exam_setups table returns 8 accumulated titles for a LOWERBASIC
  // class (CA, ORAL, PSYCHO, HW, EXAM, H/W, MTA, REPORT). Using them verbatim made
  // marksheetSchema reject every record with "more titles than allowed".
  it("ignores stale exam-setup titles and keeps the category's canonical columns", () => {
    const lbExtraction = extraction({
      columnTitles: [
        { title: "MTA", maxMark: 30 },
        { title: "CA", maxMark: 10 },
        { title: "REPORT", maxMark: 10 },
        { title: "EXAM", maxMark: 50 },
      ],
      records: [{ subjectCode: "CIVIC", marks: [30, 10, 8, 45], subjectRemark: null }],
    });

    const { records, errors } = composeRecords({
      ...base,
      category: "LOWERBASIC",
      extraction: lbExtraction,
      examTitles: ["CA", "ORAL", "PSYCHO", "HW", "EXAM", "H/W", "MTA", "REPORT"],
    });

    expect(records[0].titles).toEqual(["MTA", "CA", "REPORT", "EXAM"]);
    expect(records[0].marks).toEqual([30, 10, 8, 45]);
    expect(records[0].totalScore).toBe(93);
    expect(errors).toEqual([]);
    expect(records[0].titles.length).toBeLessThanOrEqual(4);
  });

  it("warns when an expected column is missing from the page", () => {
    const missing = extraction({
      columnTitles: [
        { title: "MTA", maxMark: 30 },
        { title: "CA", maxMark: 10 },
        { title: "EXAM", maxMark: 50 },
      ],
      records: [{ subjectCode: "CIVIC", marks: [30, 10, 45], subjectRemark: null }],
    });

    const { warnings } = composeRecords({
      ...base,
      category: "LOWERBASIC",
      extraction: missing,
      examTitles: ["MTA", "CA", "REPORT", "EXAM"],
    });

    expect(warnings).toContain('Expected column "REPORT" was not found on the page');
  });

  // Every category's maximums sum to exactly 100, so grading on the raw total and on the
  // percentage agree while every column is present. They diverge when a column is missing:
  // 85 out of an available 90 is 94%, which is an A, not a C.
  it("grades on the percentage when a column is missing", () => {
    const missingReport = extraction({
      columnTitles: [
        { title: "MTA", maxMark: 30 },
        { title: "CA", maxMark: 10 },
        { title: "EXAM", maxMark: 50 },
      ],
      records: [{ subjectCode: "CIVIC", marks: [30, 10, 45], subjectRemark: null }],
    });

    const { records } = composeRecords({
      ...base,
      category: "LOWERBASIC",
      extraction: missingReport,
      examTitles: ["MTA", "CA", "REPORT", "EXAM"],
    });

    expect(records[0].totalScore).toBe(85);
    expect(records[0].fullMarks).toEqual([30, 10, 50]);
    expect(records[0].titles).toEqual(["MTA", "CA", "EXAM"]);
    // 85/90 = 94.4% -> A. Grading the raw 85 would give C.
    expect(records[0].grade).toBe("A");
  });

  it("grades on the percentage for a full page too", () => {
    const { records } = composeRecords({
      ...base,
      category: "LOWERBASIC",
      extraction: extraction({
        columnTitles: [
          { title: "MTA", maxMark: 30 },
          { title: "CA", maxMark: 10 },
          { title: "REPORT", maxMark: 10 },
          { title: "EXAM", maxMark: 50 },
        ],
        records: [{ subjectCode: "CIVIC", marks: [30, 10, 10, 45], subjectRemark: null }],
      }),
    });
    expect(records[0].totalScore).toBe(95);
    expect(records[0].fullMarks).toEqual([30, 10, 10, 50]);
    expect(records[0].grade).toBe("A");
  });
});

describe("gradeFor", () => {
  it("uses EYFS ranges for NURSERY, GRADEK and DAYCARE", () => {
    expect(gradeFor(75, "NURSERY").grade).toBe("EMERGING");
    expect(gradeFor(85, "GRADEK").grade).toBe("EXPECTED");
    expect(gradeFor(95, "DAYCARE").grade).toBe("EXCEEDING");
  });

  it("uses grader ranges for LOWERBASIC and MIDDLEBASIC", () => {
    expect(gradeFor(65, "LOWERBASIC").grade).toBe("E");
    expect(gradeFor(98, "MIDDLEBASIC").grade).toBe("A");
  });
});

describe("mapRatings", () => {
  it("returns an empty array when the rating box is blank", () => {
    expect(mapRatings(extraction({ ratings: [{ attribute: "Punctuality", rate: null }] }))).toEqual(
      []
    );
  });

  it("maps a filled trait to its scale label and keeps the 1-5 value", () => {
    const ratings = mapRatings(extraction({ ratings: [{ attribute: "Excellent", rate: 5 }] }));
    expect(ratings).toEqual([
      { attribute: "Excellent", rate: 5, remark: "Excellent", color: null },
    ]);
  });

  it("drops a trait that is not on the scale", () => {
    expect(mapRatings(extraction({ ratings: [{ attribute: "Unknown trait", rate: 3 }] }))).toEqual([]);
  });
});

describe("buildMarksheet", () => {
  const facts = {
    school: {
      id: 1,
      name: "EduApex",
      email: "a@b.c",
      phone: "000",
      city: "Lagos",
      state: "Lagos",
      title: "EduApex",
      vacation_date: "2026-07-31",
    },
    student: {
      id: 900,
      examTypeId: 2,
      fullName: "ADAKOLE",
      gender: "Female",
      parentEmail: "p@b.c",
      parentName: "Parent",
      term: "First Term",
      title: "TERMLY REPORT",
      className: "CRECHE",
      sectionName: "A",
      adminNo: 921,
      sessionYear: "2025/2026",
      token: "tok",
    },
    category: "NURSERY" as const,
    assignedSubjects: candidates,
  };

  it("takes the category from the DB, never from the paper", () => {
    const { marksheet } = buildMarksheet(extraction(), facts);
    expect(marksheet.student.category).toBe("NURSERY");
    expect(marksheet.student.category).not.toBe("CRECHE");
  });

  it("puts the teacher remark under marksheet.remark.remark only", () => {
    const { marksheet } = buildMarksheet(extraction(), facts);
    expect(marksheet.remark?.remark).toBe("Doing well");
    expect(marksheet).not.toHaveProperty("remark", "Doing well");
  });

  it("fills attendance from the paper and defaults a missing value to 0", () => {
    const { marksheet } = buildMarksheet(extraction({ daysAbsent: null }), facts);
    expect(marksheet.student.daysOpened).toBe(102);
    expect(marksheet.student.daysAbsent).toBe(0);
  });

  it("refuses a DAYCARE roster row instead of emitting empty records", () => {
    const { errors } = buildMarksheet(extraction(), { ...facts, category: "DAYCARE" });
    expect(errors).toContain("DAYCARE has no numeric marks; the scanner does not support it");
  });

  it("keeps records and subjects aligned so marksheetSchema's refine passes", () => {
    const { marksheet } = buildMarksheet(extraction(), facts);
    expect(marksheet.records.length).toBeGreaterThan(0);
    expect(marksheet.records.every((record) => record.subjectId > 0)).toBe(true);
    expect(marksheet.subjects).toHaveLength(marksheet.records.length);
  });
});

describe("composeMarksheet — the single composition entry point", () => {
  const facts = {
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
      fullName: "SHINDARA EMMANUEL OLANREWAJU",
      gender: "Male",
      parentEmail: "p@b.c",
      parentName: "Parent",
      term: "2025/2026",
      title: "TERMLY",
      className: "LOWER BASIC 1",
      sectionName: "C",
      adminNo: 178,
      sessionYear: "2025/2026",
      token: "tok",
    },
    category: "NURSERY" as const,
    assignedSubjects: candidates,
  };

  const nurseryPage = extraction();

  it("returns a validated Marksheet from paper input", async () => {
    const result = await composeMarksheet(nurseryPage, facts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.marksheet.records).toHaveLength(2);
    expect(result.marksheet.student.category).toBe("NURSERY");
  });

  it("NEVER lets the paper's name reach the marksheet — upsertMarksheet renames from it", async () => {
    const result = await composeMarksheet(nurseryPage, facts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The paper said ADAKOLE / 921 / CRECHE A; the DB says otherwise.
    expect(result.marksheet.student.fullName).toBe("SHINDARA EMMANUEL OLANREWAJU");
    expect(result.marksheet.student.adminNo).toBe(178);
    expect(result.marksheet.student.className).toBe("LOWER BASIC 1");
    // ...but the paper values are still available for the review grid to show.
    expect(result.paperIdentity.fullName).toBe("ADAKOLE");
    expect(result.paperIdentity.admissionNo).toBe(921);
  });

  it("takes the category from the DB, not the paper's CRECHE", async () => {
    const result = await composeMarksheet(nurseryPage, facts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.marksheet.student.category).toBe("NURSERY");
  });

  it("fails with UNRESOLVED when a subject cannot be matched", async () => {
    const bad = extraction({
      records: [{ subjectCode: "ASTRONOMY", marks: [10, 5, 5, 5, 50], subjectRemark: null }],
    });
    const result = await composeMarksheet(bad, facts);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("UNRESOLVED");
    expect(result.errors[0]).toMatch(/must be selected before saving/);
  });

  it("fails with SCHEMA when the composed result is internally inconsistent", async () => {
    const result = await composeMarksheet(nurseryPage, {
      ...facts,
      category: "DAYCARE",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("UNRESOLVED");
    expect(result.errors).toContain(
      "DAYCARE has no numeric marks; the scanner does not support it"
    );
  });

  it("reports warnings without failing the composition", async () => {
    const withBonus = extraction({
      columnTitles: [
        { title: "CA", maxMark: 30 },
        { title: "ORAL", maxMark: 5 },
        { title: "PSYCHO", maxMark: 5 },
        { title: "HW", maxMark: 10 },
        { title: "EXAM", maxMark: 50 },
        { title: "BONUS", maxMark: 5 },
      ],
      records: [{ subjectCode: "PSRN", marks: [10, 5, 5, 5, 50, 3], subjectRemark: null }],
    });
    const result = await composeMarksheet(withBonus, facts);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.ok).toBe(true);
  });
});
