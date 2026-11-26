import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { marksheetSchema, type Marksheet } from "$lib/schema/marksheet";
import { EXAM_MARK_MAXIMUMS } from "$lib/constants/assessment";
import { readScanEnvelope, writeScanEnvelope } from "./scan-store";
import { canCommitFrom } from "./scan-status";
import { advanceEnvelope, type ScanEnvelope } from "./scan-types";
import { loadScanFacts } from "./scan-facts";

/**
 * Writes a reviewed draft through the existing results pipeline.
 *
 * The ordering here is load-bearing: `upsertMarksheet` -> `cleanMarks` **deletes the whole
 * `teacher_remarks` row** for (student, exam, academic), and `upsertTeacherRemark` only
 * re-inserts when the marksheet carries remark text. So the metadata envelope is destroyed at
 * the moment of commit and must be re-written afterwards. Skipping that step loses the capture
 * id, the document link and the whole audit trail (plan risk 7).
 */

export class CommitRejectedError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "NOT_DRAFT" | "VALIDATION" | "STALE" | "PIPELINE"
  ) {
    super(message);
    this.name = "CommitRejectedError";
  }
}

export interface CommitInput {
  studentId: number;
  examTypeId: number;
  schoolId: number;
  academicId: number;
  staffId: number;
  userId: number;
  /** The teacher-edited marksheet. Authoritative over the stored draft. */
  marksheet: Marksheet;
}

export interface CommitOutput {
  status: "committed";
  recordId: number | null;
  envelope: ScanEnvelope;
  warnings: string[];
}

/**
 * Re-validates against the DB rather than trusting the posted marksheet: subject ids must still
 * be assigned to this class, and every cell must still be inside the category maximum. The
 * review grid can be open for minutes, so a stale client is a real possibility.
 */
export async function validateForCommit(input: {
  marksheet: Marksheet;
  category: Marksheet["student"]["category"];
  assignedSubjectIds: number[];
}): Promise<string[]> {
  const errors: string[] = [];
  const maxima = EXAM_MARK_MAXIMUMS[input.category] ?? {};

  for (const record of input.marksheet.records) {
    if (!Number.isInteger(record.subjectId) || record.subjectId <= 0) {
      errors.push(`${record.subjectCode}: subject is not resolved`);
      continue;
    }
    if (!input.assignedSubjectIds.includes(record.subjectId)) {
      errors.push(`${record.subjectCode}: subject is not assigned to this class`);
    }
    if (record.marks.length !== record.titles.length) {
      errors.push(`${record.subjectCode}: ${record.marks.length} marks for ${record.titles.length} columns`);
    }
    record.titles.forEach((title, index) => {
      const value = record.marks[index];
      if (value === undefined || !Number.isInteger(value) || value < 0) {
        errors.push(`${record.subjectCode} ${title}: invalid mark`);
        return;
      }
      const max = maxima[title.toUpperCase()];
      if (max !== undefined && value > max) {
        errors.push(`${record.subjectCode} ${title}: ${value} exceeds the maximum of ${max}`);
      }
    });
  }

  if (input.marksheet.records.length === 0) {
    errors.push("No subjects to save");
  }

  return errors;
}

export async function commitScan(input: CommitInput): Promise<CommitOutput> {
  const key = {
    studentId: input.studentId,
    examTypeId: input.examTypeId,
    academicId: input.academicId,
  };

  const current = await readScanEnvelope(key);
  if (!current) {
    throw new CommitRejectedError("No scan draft for this student", "NOT_FOUND");
  }
  /**
   * `committed` is re-savable: `View Mark` opens the same grid so a teacher can correct a mark
   * after saving (spec §4A labels it "View Mark (Edit)"). `published` is not — changing a result
   * a parent has already received must go through `Edit & Re-publish`, which re-sends the PDF.
   * Re-committing overwrites through `upsertMarksheet`, which is already idempotent per
   * (student, exam, academic).
   */
  if (!canCommitFrom(current.status)) {
    throw new CommitRejectedError(
      `Cannot save from status "${current.status}"`,
      "NOT_DRAFT"
    );
  }

  const parsed = await marksheetSchema.safeParseAsync(input.marksheet);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new CommitRejectedError(`Marksheet is invalid: ${detail}`, "VALIDATION");
  }

  const facts = await loadScanFacts({
    studentId: input.studentId,
    examTypeId: input.examTypeId,
    schoolId: input.schoolId,
    academicId: input.academicId,
  });

  if (parsed.data.student.category !== facts.category) {
    throw new CommitRejectedError(
      `Category mismatch: draft says ${parsed.data.student.category}, student is ${facts.category}`,
      "STALE"
    );
  }

  const subjectErrors = await validateForCommit({
    marksheet: parsed.data,
    category: facts.category,
    assignedSubjectIds: facts.assignedSubjects.map((subject) => subject.subjectId),
  });
  if (subjectErrors.length > 0) {
    throw new CommitRejectedError(subjectErrors.join("; "), "VALIDATION");
  }

  const assessment = await createAssessmentServiceForRequest(
    createTenantContext({
      schoolId: input.schoolId,
      userId: input.userId,
      staffId: input.staffId,
      academicId: input.academicId,
      examTypeId: input.examTypeId,
      studentId: input.studentId,
      classId: facts.classId,
      sectionId: facts.sectionId,
    })
  );

  try {
    await assessment.upsertMarksheet(parsed.data, input.staffId);
  } catch (cause) {
    throw new CommitRejectedError(
      cause instanceof Error ? cause.message : "The results pipeline rejected this marksheet",
      "PIPELINE"
    );
  }

  // cleanMarks deleted the row; re-write the envelope so the audit trail survives the commit.
  const committed = advanceEnvelope(current, {
    status: "committed",
    marksheet: parsed.data,
  });
  await writeScanEnvelope({ ...key, envelope: committed });

  return {
    status: "committed",
    recordId: parsed.data.recordId ?? null,
    envelope: committed,
    warnings: [],
  };
}

/**
 * Verifies the envelope survived the pipeline. Used by the live-DB test and by `publish` as a
 * cheap guard: if this fails, the row was wiped by another write path (risk 10).
 */
export async function assertEnvelopeSurvived(key: {
  studentId: number;
  examTypeId: number;
  academicId: number;
}): Promise<boolean> {
  const envelope = await readScanEnvelope(key);
  return envelope !== null && envelope.marksheet !== null;
}

/** Marks an already-committed scan as published. Never creates a row. */
export async function markScanPublished(key: {
  studentId: number;
  examTypeId: number;
  academicId: number;
}): Promise<ScanEnvelope | null> {
  const current = await readScanEnvelope(key);
  if (!current || current.status === "published") return current;
  if (current.status !== "committed") return current;
  const published = advanceEnvelope(current, { status: "published" });
  await writeScanEnvelope({ ...key, envelope: published });
  return published;
}
