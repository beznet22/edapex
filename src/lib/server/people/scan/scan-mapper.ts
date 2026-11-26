import { EXAM_MARK_MAXIMUMS, AttributeEnum, AttributeRemark } from "$lib/constants/assessment";
import { GRADE_RANGES } from "$lib/server/service/assessment.service";
import { marksheetSchema, type Category, type MarksRecord, type Marksheet, type Rating, type SubjectAssigned } from "$lib/schema/marksheet";
import type { ScanExtraction } from "./scan-extraction-schema";
import { assessIdentity } from "./scan-identity";
import { matchSubjectCode, normaliseSubjectCode } from "./scan-subject-match";
import type { ScannerSubject } from "./scan-subject-match";
export { matchSubjectCode, normaliseSubjectCode } from "./scan-subject-match";
export type { ScannerSubject, SubjectMatch } from "./scan-subject-match";

const TITLES_BY_CATEGORY: Record<Category, readonly string[]> = {
  DAYCARE: [],
  GRADEK: ["CA1", "CA2", "HW", "REPORT", "PSYCHO", "EXAM"],
  LOWERBASIC: ["MTA", "CA", "REPORT", "EXAM"],
  MIDDLEBASIC: ["MTA", "CA", "REPORT", "EXAM"],
  NURSERY: ["CA", "ORAL", "PSYCHO", "HW", "EXAM"],
};

/**
 * Uppercase, drop everything that is not alphanumeric or `/`, then **sort the slash-separated
 * segments**. This is what makes `CLL/JP` equal to `JP/CLL` — the adakole paper prints the
 * reversed form and a naive lookup silently fails (plan §5a).
 */
export const gradeFor = (score: number, category: Category): { grade: string; color: string } => {
  const ranges = category === "LOWERBASIC" || category === "MIDDLEBASIC"
    ? GRADE_RANGES.GRADERS
    : GRADE_RANGES.EYFS;
  const match = ranges.find((range) => score >= range.min && score <= range.max);
  return match
    ? { grade: match.grade, color: match.color }
    : { grade: "N/A", color: "bg-gray-200" };
};

export interface ComposeInput {
  extraction: ScanExtraction;
  category: Category;
  assignedSubjects: ScannerSubject[];
  studentId: number;
  examTypeId: number;
  /** Exam setup titles for this class/section/term, when one exists. */
  examTitles?: string[] | null;
}

export interface ComposeOutput {
  records: MarksRecord[];
  subjects: SubjectAssigned[];
  ratings: Rating;
  warnings: string[];
  errors: string[];
  lowConfidence: string[];
}

/**
 * Re-keys labelled columns into `titles` order and validates each cell against
 * `EXAM_MARK_MAXIMUMS[category]`. The doc's `CA > 40` rule is wrong: CA is 10 for
 * LOWERBASIC/MIDDLEBASIC, 30 for NURSERY, and GRADEK splits it into CA1/CA2 at 20 each.
 */
export function composeRecords(input: ComposeInput): ComposeOutput {
  const { extraction, category, assignedSubjects, studentId, examTypeId } = input;
  const warnings: string[] = [];
  const errors: string[] = [];
  const lowConfidence: string[] = [];

  const allowedTitles = TITLES_BY_CATEGORY[category];
  const categoriesMax = EXAM_MARK_MAXIMUMS[category] ?? {};

  const pageTitles = extraction.columnTitles.map((column) => column.title.toUpperCase());

  /**
   * `sm_exam_setups` accumulates titles across years and categories: for a LOWERBASIC class in
   * the live DB it returns 8 titles (CA, ORAL, PSYCHO, HW, EXAM, H/W, MTA, REPORT), which
   * includes NURSERY-only columns. `marksheetSchema` rejects more titles than the category
   * allows, so `titles` is the **category's canonical order** filtered to what the paper
   * actually shows — never the raw exam-setup list.
   */
  const titles = allowedTitles.filter((title) => pageTitles.includes(title));
  const paperOnly = pageTitles.filter((title) => !allowedTitles.includes(title));
  const setupTitles = input.examTitles?.map((title) => title.toUpperCase()) ?? [];

  for (const title of paperOnly) {
    warnings.push(`Column "${title}" is not part of the ${category} mark scheme`);
  }
  for (const title of allowedTitles) {
    if (!pageTitles.includes(title) && setupTitles.includes(title)) {
      warnings.push(`Expected column "${title}" was not found on the page`);
    }
  }
  if (titles.length === 0 && category !== "DAYCARE") {
    errors.push(`The page has no columns from the ${category} mark scheme`);
  }

  const byColumnIndex = new Map<string, number>();
  pageTitles.forEach((title, index) => byColumnIndex.set(title, index));

  const records: MarksRecord[] = [];
  const seen = new Set<number>();

  for (const row of extraction.records) {
    const match = matchSubjectCode(row.subjectCode, assignedSubjects);
    if (match.warning) warnings.push(match.warning);
    if (match.subjectId === null) {
      errors.push(`Subject "${row.subjectCode}" must be selected before saving`);
    } else if (seen.has(match.subjectId)) {
      errors.push(`Subject "${row.subjectCode}" appears twice on the page`);
    } else {
      seen.add(match.subjectId);
    }

    const marks: number[] = [];
    for (const title of titles) {
      const index = byColumnIndex.get(title);
      const value = index === undefined ? null : row.marks[index] ?? null;
      marks.push(value ?? 0);

      if (value === null) {
        lowConfidence.push(`${row.subjectCode} ${title}: blank`);
        continue;
      }
      const max = categoriesMax[title];
      if (max !== undefined && value > max) {
        errors.push(`${row.subjectCode} ${title}: ${value} exceeds the maximum of ${max}`);
      }
    }

    const fullMarks = titles.map((title) => categoriesMax[title] ?? 0);
    const totalScore = Math.ceil(marks.reduce((sum, mark) => sum + mark, 0));
    const fullTotal = fullMarks.reduce((sum, max) => sum + max, 0);

    /**
     * Grade on the **percentage**, matching `AssessmentService.doProcessMarks`, which grades
     * `subjectPercentageMark(totalSubjectMarks, totalSubjectFullMarks)`. Grading the raw total
     * would award "EXCEEDING" to a 94/100 and also to a 94/140, so the review grid would show a
     * grade the persisted result does not agree with.
     */
    const percentage = fullTotal === 0 ? 0 : Math.round((totalScore / fullTotal) * 10000) / 100;
    const grade = gradeFor(percentage, category);

    /**
     * DAYCARE has no numeric marks. `AssessmentService.doProcessMarks` branches on
     * `examTitles.length === 0` and writes the narrative to `sm_result_stores.teacher_remarks`
     * with `total_marks = 0` and no `sm_mark_stores` rows. Verified against live data: every
     * DAYCARE result has `total_marks = 0.00`, a populated `teacher_remarks`, and zero mark rows.
     *
     * `recordSchema` requires `learningOutcome` to be non-empty and HTML-free, so a blank cell is
     * surfaced as an error for the teacher to fill in the grid rather than silently dropped.
     */
    if (category === "DAYCARE") {
      const outcome = (row.subjectRemark ?? "").trim();
      if (outcome === "") {
        errors.push(`${row.subjectCode}: a learning outcome is required for DAYCARE`);
      } else if (/<[^>]+>/.test(outcome)) {
        errors.push(`${row.subjectCode}: the learning outcome contains markup`);
      }

      records.push({
        studentId,
        resultId: 0,
        subjectId: match.subjectId ?? 0,
        subject: match.subjectName ?? row.subjectCode,
        subjectCode: match.subjectCode,
        objectives: null,
        titleIds: [],
        titles: [],
        markIds: [],
        marks: [],
        fullMarks: [],
        totalScore: 0,
        grade: "",
        color: undefined,
        category,
        learningOutcome: outcome,
      });
      continue;
    }

    records.push({
      studentId,
      resultId: 0,
      subjectId: match.subjectId ?? 0,
      subject: match.subjectName ?? row.subjectCode,
      subjectCode: match.subjectCode,
      objectives: null,
      titleIds: [],
      titles: [...titles],
      markIds: [],
      marks,
      fullMarks,
      totalScore,
      grade: grade.grade,
      color: grade.color,
      category,
    });
  }

  const subjects: SubjectAssigned[] = records
    .filter((record) => record.subjectId > 0)
    .map((record) => ({
      subjectId: record.subjectId,
      subjectCode: record.subjectCode,
      teacherId: null,
    }));

  return {
    records,
    subjects,
    ratings: mapRatings(extraction),
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
    lowConfidence: [...new Set(lowConfidence)],
  };
}

/**
 * Only maps ratings the page actually carries. Sending a full five-trait array would invent
 * data; sending `[]` renders no rating block, which is the honest representation.
 *
 * `rate` must stay 1–5: it is both the score and the key into `AttributeRemark`.
 */
export function mapRatings(extraction: ScanExtraction): Rating {
  const filled = extraction.ratings.filter(
    (rating): rating is { attribute: string; rate: number } => rating.rate !== null
  );
  if (filled.length === 0) return [];

  const entries: Rating = [];
  for (const rating of filled) {
    const scale = Object.entries(AttributeRemark).find(
      ([, label]) => label.toUpperCase() === rating.attribute.trim().toUpperCase()
    );
    if (!scale) continue;
    const [value, label] = scale;
    entries.push({
      attribute: label,
      rate: Number(value),
      remark: AttributeRemark[value as unknown as AttributeEnum] ?? null,
      color: null,
    });
  }
  return entries;
}

export interface MapperDbFacts {
  school: Marksheet["school"];
  student: Omit<
    Marksheet["student"],
    "category" | "daysOpened" | "daysPresent" | "daysAbsent"
  >;
  category: Category;
  assignedSubjects: ScannerSubject[];
  examTitles?: string[] | null;
}

/**
 * Composes a `Marksheet` from DB facts plus the extraction.
 *
 * Identity fields are taken from `facts.student` **unconditionally** — never from the paper.
 * `upsertMarksheet` renames the student when `marksheet.student.fullName` differs from the DB
 * (`assessment.service.ts:384`), so letting a model-derived name through would rename a real
 * student from a photographed sheet. `fullName` is the DB name here; the paper's name is only
 * ever surfaced for display, never persisted.
 *
 * `category` likewise comes from `MapperDbFacts` only. The paper prints `Category: CRECHE`, which
 * is not in `categoryEnum`; `upsertMarksheet` calls `categoryEnum.parse`, so a paper-derived value
 * would throw.
 */
export function buildMarksheet(
  extraction: ScanExtraction,
  facts: MapperDbFacts
): { marksheet: Marksheet; warnings: string[]; errors: string[]; lowConfidence: string[] } {
  const composed = composeRecords({
    extraction,
    category: facts.category,
    assignedSubjects: facts.assignedSubjects,
    studentId: facts.student.id,
    examTypeId: facts.student.examTypeId,
    examTitles: facts.examTitles,
  });

  const marksheet: Marksheet = {
    school: facts.school,
    student: {
      ...facts.student,
      category: facts.category,
      daysOpened: extraction.daysOpened ?? 0,
      daysPresent: extraction.daysPresent ?? 0,
      daysAbsent: extraction.daysAbsent ?? 0,
    },
    subjects: composed.subjects,
    records: composed.records,
    ratings: composed.ratings,
    remark: { remark: extraction.teacherRemark },
  };

  return {
    marksheet,
    warnings: composed.warnings,
    errors: composed.errors,
    lowConfidence: composed.lowConfidence,
  };
}

export type ComposedMarksheet =
  | {
      ok: true;
      marksheet: Marksheet;
      warnings: string[];
      errors: string[];
      lowConfidence: string[];
      /** Names read off the paper, kept for the review grid only. Never persisted. */
      paperIdentity: { fullName: string; admissionNo: number; className: string };
      identity: { level: "match" | "uncertain" | "mismatch"; similarity: number };
    }
  | {
      ok: false;
      reason: "SCHEMA" | "UNRESOLVED";
      message: string;
      warnings: string[];
      errors: string[];
      lowConfidence: string[];
      paperIdentity: { fullName: string; admissionNo: number; className: string };
      identity: { level: "match" | "uncertain" | "mismatch"; similarity: number };
    };

/**
 * The single composition entry point: paper extraction -> re-key + DB-fact injection +
 * category resolution -> `marksheetSchema` validation of the **result**.
 *
 * The model never sees `marksheetSchema`; it emits the paper shape measured at 112/114. This
 * runs the transform and then validates what came out, so a composition bug fails loudly here
 * rather than at commit.
 */
export async function composeMarksheet(
  extraction: ScanExtraction,
  facts: MapperDbFacts
): Promise<ComposedMarksheet> {
  const paperIdentity = {
    fullName: extraction.student.fullName,
    admissionNo: extraction.student.admissionNo,
    className: extraction.student.className,
  };

  const built = buildMarksheet(extraction, facts);

  /**
   * The scan is student-locked, so a paper naming a different student means the wrong log book was
   * photographed. Identity always comes from the DB (never the paper), but a mismatch must be loud
   * — otherwise one child's marks are filed under another's name.
   *
   * Matching is name-led (see `scan-identity.ts`): teachers frequently misremember or omit the
   * admission number, but they do not forget whose book they are holding.
   */
  const identity = assessIdentity({
    paperName: paperIdentity.fullName,
    paperAdmissionNo: paperIdentity.admissionNo,
    dbName: facts.student.fullName,
    dbAdmissionNo: facts.student.adminNo,
  });
  if (identity.warning) built.warnings.push(identity.warning);

  if (built.errors.length > 0) {
    return {
      ok: false,
      reason: "UNRESOLVED",
      message: built.errors[0],
      warnings: built.warnings,
      errors: built.errors,
      lowConfidence: built.lowConfidence,
      paperIdentity,
      identity: { level: identity.level, similarity: identity.similarity },
    };
  }

  const parsed = await marksheetSchema.safeParseAsync(built.marksheet);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return {
      ok: false,
      reason: "SCHEMA",
      message: detail,
      warnings: built.warnings,
      errors: [...built.errors, detail],
      lowConfidence: built.lowConfidence,
      paperIdentity,
      identity: { level: identity.level, similarity: identity.similarity },
    };
  }

  return {
    ok: true,
    marksheet: parsed.data,
    warnings: built.warnings,
    errors: built.errors,
    lowConfidence: built.lowConfidence,
    paperIdentity,
    identity: { level: identity.level, similarity: identity.similarity },
  };
}
