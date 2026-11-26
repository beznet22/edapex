import { describe, expect, it } from "vitest";
import {
  countExtractionCells,
  findPositionalErrors,
  parseScanExtraction,
  SCAN_EXTRACTION_NAME,
  scanExtractionJsonSchema,
  scanExtractionSchema,
  type ScanExtraction,
} from "$lib/server/people/scan/scan-extraction-schema";

const valid: ScanExtraction = {
  student: { fullName: "AMIRA SALISU", admissionNo: 521, className: "LOWER BASIC 2B" },
  daysOpened: 102,
  daysPresent: 102,
  daysAbsent: 0,
  columnTitles: [
    { title: "MTA", maxMark: 30 },
    { title: "CA", maxMark: 10 },
    { title: "REPORT", maxMark: 10 },
    { title: "EXAM", maxMark: 50 },
  ],
  records: [
    { subjectCode: "MATH", marks: [20, 8, 10, 48], subjectRemark: null },
    { subjectCode: "ENG", marks: [25, 10, 10, 50], subjectRemark: null },
  ],
  ratings: [],
  teacherRemark: null,
  pageConfidence: "high",
};

const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(valid));

describe("scanExtractionSchema", () => {
  it("accepts a well-formed page", () => {
    expect(scanExtractionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a page with a missing top-level field", () => {
    const broken = clone();
    delete broken.columnTitles;
    expect(scanExtractionSchema.safeParse(broken).success).toBe(false);
  });

  it("strips an invented top-level key instead of letting it through", () => {
    // Zod objects drop unknown keys by default, so a hallucinated `category` is discarded
    // rather than rejected. That is the safe outcome: the value never reaches the mapper.
    // The provider is additionally told `additionalProperties: false` (asserted below).
    const parsed = scanExtractionSchema.safeParse({ ...clone(), category: "CRECHE" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("category");
  });

  it("rejects non-integer marks", () => {
    const broken = clone();
    (broken.records as { marks: unknown }[])[0].marks = [20.5, 8, 10, 48];
    expect(scanExtractionSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects negative marks but allows null for a blank cell", () => {
    const negative = clone();
    (negative.records as { marks: unknown }[])[0].marks = [-1, 8, 10, 48];
    expect(scanExtractionSchema.safeParse(negative).success).toBe(false);

    const blank = clone();
    (blank.records as { marks: unknown }[])[0].marks = [20, null, 10, 48];
    expect(scanExtractionSchema.safeParse(blank).success).toBe(true);
  });

  it("rejects an empty records array — a page always has subjects", () => {
    const broken = clone();
    broken.records = [];
    expect(scanExtractionSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an empty columnTitles array", () => {
    const broken = clone();
    broken.columnTitles = [];
    expect(scanExtractionSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an unknown pageConfidence value", () => {
    expect(scanExtractionSchema.safeParse({ ...clone(), pageConfidence: "certain" }).success).toBe(
      false
    );
  });
});

describe("scanExtractionJsonSchema", () => {
  it("is a flat object schema with no $ref indirection", () => {
    expect(scanExtractionJsonSchema.type).toBe("object");
    expect(JSON.stringify(scanExtractionJsonSchema)).not.toContain("$ref");
  });

  it("marks every field required — strict mode rejects partial objects", () => {
    const required = scanExtractionJsonSchema.required as string[];
    expect(required).toEqual(
      expect.arrayContaining([
        "student",
        "daysOpened",
        "daysPresent",
        "daysAbsent",
        "columnTitles",
        "records",
        "ratings",
        "teacherRemark",
        "pageConfidence",
      ])
    );
    expect(required).toHaveLength(9);
  });

  it("forbids additional properties", () => {
    expect(scanExtractionJsonSchema.additionalProperties).toBe(false);
  });

  it("omits category entirely — the model is never asked for it", () => {
    const json = JSON.stringify(scanExtractionJsonSchema);
    expect(json).not.toContain("category");
    expect(Object.keys(scanExtractionJsonSchema.properties as object)).not.toContain("category");
  });

  it("declares a stable format name for the provider", () => {
    expect(SCAN_EXTRACTION_NAME).toBe("learner_log_book_extraction");
  });
});

describe("parseScanExtraction", () => {
  it("returns the parsed value for valid input", () => {
    expect(parseScanExtraction(valid)?.student.admissionNo).toBe(521);
  });

  it("returns null instead of throwing for garbage", () => {
    expect(parseScanExtraction(null)).toBeNull();
    expect(parseScanExtraction({})).toBeNull();
    expect(parseScanExtraction("a string")).toBeNull();
  });
});

describe("countExtractionCells", () => {
  it("counts every mark slot including nulls", () => {
    expect(countExtractionCells(valid)).toBe(8);
  });
});

describe("findPositionalErrors", () => {
  it("reports nothing when every row matches the column count", () => {
    expect(findPositionalErrors(valid)).toEqual([]);
  });

  it("flags a short row rather than silently truncating", () => {
    const broken = clone() as ScanExtraction;
    broken.records[0].marks = [20, 8];
    expect(findPositionalErrors(broken)).toEqual(["MATH: expected 4 marks, received 2"]);
  });

  it("flags a long row", () => {
    const broken = clone() as ScanExtraction;
    broken.records[1].marks = [25, 10, 10, 50, 99];
    expect(findPositionalErrors(broken)).toEqual(["ENG: expected 4 marks, received 5"]);
  });
});
