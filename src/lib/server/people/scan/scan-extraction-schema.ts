import { z } from "zod";

/**
 * Paper-shaped extraction schema.
 *
 * Deliberately NOT `marksheetSchema`: that requires `school`, 17 `student` fields, `token`,
 * `sessionYear`, `ratings` and `subjectId`s — none of which appear on a photographed log book.
 * Asking the model for them invites invention. This schema covers only what ink can answer.
 *
 * `category` is omitted on purpose. The paper prints `Category: CRECHE`, but `CRECHE` is not in
 * `categoryEnum`, and the DB is the only correct source (see plan §5a).
 */

const integer = z.number().int();

export const scanStudentSchema = z.object({
  fullName: z.string().min(1).describe("Student name exactly as handwritten or printed on the page"),
  admissionNo: integer.positive().describe("Admission number printed on the page"),
  className: z.string().min(1).describe("Class name, e.g. 'LOWER BASIC 2B'"),
});

export const scanColumnSchema = z.object({
  title: z.string().min(1).describe("Printed mark column header, left to right, e.g. 'MTA', 'CA', 'EXAM'"),
  maxMark: integer.positive().nullable().describe("Printed maximum for this column, null when not printed"),
});

export const scanRecordSchema = z.object({
  subjectCode: z
    .string()
    .min(1)
    .describe("Subject code or name as printed in the leftmost column, e.g. 'CLL/JP', 'BASIC SCIENCE'"),
  marks: z
    .array(integer.nonnegative().nullable())
    .describe("One entry per column in columnTitles order; null when the cell is blank"),
  subjectRemark: z
    .string()
    .nullable()
    .describe(
      "The free-text cell beside this subject, verbatim. For DAYCARE sheets this is the learning " +
        "outcome narrative; for graded sheets it is a short remark. Null when the cell is blank."
    ),
});

export const scanRatingSchema = z.object({
  attribute: z.string().min(1).describe("Trait name as printed, e.g. 'Punctuality'"),
  rate: integer.nullable().describe("Printed rating 1-5, null when left blank"),
});

export const scanExtractionSchema = z.object({
  student: scanStudentSchema,
  daysOpened: integer.nonnegative().nullable().describe("Days the term was open, when printed"),
  daysPresent: integer.nonnegative().nullable().describe("Days the student attended, when printed"),
  daysAbsent: integer.nonnegative().nullable().describe("Days the student was absent, when printed"),
  columnTitles: z.array(scanColumnSchema).min(1).describe("Every mark column header, left to right"),
  records: z.array(scanRecordSchema).min(1).describe("One entry per subject row on the page"),
  ratings: z.array(scanRatingSchema).describe("Trait ratings when the page has a rating box, else []"),
  teacherRemark: z.string().nullable().describe("The teacher's written remark, null when absent"),
  pageConfidence: z
    .enum(["high", "medium", "low"])
    .describe("How legible the page was; 'low' when any cell was a guess"),
});

export type ScanExtraction = z.infer<typeof scanExtractionSchema>;
export type ScanExtractionStudent = z.infer<typeof scanStudentSchema>;
export type ScanExtractionRecord = z.infer<typeof scanRecordSchema>;
export type ScanExtractionColumn = z.infer<typeof scanColumnSchema>;

export const SCAN_EXTRACTION_NAME = "learner_log_book_extraction";

/** DeepSeek `text.format.schema` / Gemini `responseSchema`. Zod 4 emits JSON Schema directly. */
export const scanExtractionJsonSchema = z.toJSONSchema(scanExtractionSchema, {
  target: "draft-7",
  io: "output",
  unrepresentable: "any",
});

export const parseScanExtraction = (raw: unknown): ScanExtraction | null => {
  const result = scanExtractionSchema.safeParse(raw);
  return result.success ? result.data : null;
};

/** Cell count used for the per-cell maximum check and for attempt-diff scoring. */
export const countExtractionCells = (extraction: ScanExtraction): number =>
  extraction.records.reduce((total, record) => total + record.marks.length, 0);

/**
 * Positional contract check. The model must return exactly one mark per column; anything else
 * means the row was misread and the draft must be flagged rather than silently truncated.
 */
export const findPositionalErrors = (extraction: ScanExtraction): string[] => {
  const expected = extraction.columnTitles.length;
  const errors: string[] = [];
  for (const record of extraction.records) {
    if (record.marks.length !== expected) {
      errors.push(
        `${record.subjectCode}: expected ${expected} marks, received ${record.marks.length}`
      );
    }
  }
  return errors;
};
