import { createAssessmentPublisherServiceForRequest } from "$lib/server/service/assessment-publisher.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { loadScanFacts } from "./scan-facts";
import { markScanPublished } from "./scan-commit";
import { readScanEnvelope } from "./scan-store";
import type { ScanEnvelope } from "./scan-types";

/**
 * Publishing reuses `AssessmentPublisherService` rather than duplicating ~300 lines of SMTP,
 * template rendering, PDF generation and timeline writes (plan §3). That is a deliberate change
 * from the earlier draft: the publisher already accepts `studentIds[]`, handles concurrency and
 * writes the `exam-<id>-<messageId>` timeline row with `visible_to_student = 1`.
 *
 * ## Why `resend: true`
 *
 * `isEmailAlreadySent` matches `type.startsWith("exam-<id>")`, which also matches the bare
 * `exam-<id>` row that `upsertMarksheet` writes with `visible_to_student = 0`. So after any
 * commit, the publisher's own check reports "already sent" and would block the first publish.
 *
 * Rather than change shared behaviour for existing flows — which would allow duplicate emails
 * from the legacy path — idempotency lives in the envelope: a scan may only publish from
 * `committed`, and it is moved to `published` immediately after a successful send. A second
 * publish attempt is refused here, before any SMTP call.
 */

export interface PublishScanInput {
  studentIds: number[];
  examTypeId: number;
  schoolId: number;
  academicId: number;
  staffId: number;
  userId: number;
}

export interface PublishOutcome {
  studentId: number;
  status: "published" | "skipped" | "failed";
  message?: string;
}

export interface PublishScanOutput {
  outcomes: PublishOutcome[];
  sent: number;
  failed: number;
  skipped: number;
}

const PUBLISHABLE: ReadonlySet<string> = new Set(["committed"]);

export async function publishScans(input: PublishScanInput): Promise<PublishScanOutput> {
  const outcomes: PublishOutcome[] = [];

  // Only students whose envelope says `committed` are eligible. `published` is skipped rather
  // than re-sent; drafts and failures are refused with a reason the UI can show per row.
  const eligible: number[] = [];
  for (const studentId of input.studentIds) {
    const envelope: ScanEnvelope | null = await readScanEnvelope({
      studentId,
      examTypeId: input.examTypeId,
      academicId: input.academicId,
    });

    if (!envelope) {
      outcomes.push({ studentId, status: "failed", message: "No scan record for this student" });
      continue;
    }
    if (envelope.status === "published") {
      outcomes.push({ studentId, status: "skipped", message: "Already published" });
      continue;
    }
    if (!PUBLISHABLE.has(envelope.status)) {
      outcomes.push({
        studentId,
        status: "failed",
        message: `Cannot publish from status "${envelope.status}"`,
      });
      continue;
    }
    eligible.push(studentId);
  }

  if (eligible.length === 0) {
    return { outcomes, sent: 0, failed: outcomes.length, skipped: 0 };
  }

  /**
   * The publisher's tenant carries `classId`/`sectionId`, and it uses them to look up assigned
   * subjects when padding a marksheet. A batch can span several classes, so one tenant built from
   * `eligible[0]` would pad every later row with the wrong class's subjects. Grouping by class
   * keeps it to one publisher per class instead of one per student.
   */
  const byClass = new Map<string, { classId: number; sectionId: number; studentIds: number[] }>();
  for (const studentId of eligible) {
    const facts = await loadScanFacts({
      studentId,
      examTypeId: input.examTypeId,
      schoolId: input.schoolId,
      academicId: input.academicId,
    });
    const key = `${facts.classId}:${facts.sectionId}`;
    const group = byClass.get(key) ?? {
      classId: facts.classId,
      sectionId: facts.sectionId,
      studentIds: [],
    };
    group.studentIds.push(studentId);
    byClass.set(key, group);
  }

  const sentIds = new Set<number>();
  const failureReasons = new Map<number, string>();

  for (const group of byClass.values()) {
    const publisher = await createAssessmentPublisherServiceForRequest(
      createTenantContext({
        schoolId: input.schoolId,
        userId: input.userId,
        staffId: input.staffId,
        academicId: input.academicId,
        examTypeId: input.examTypeId,
        classId: group.classId,
        sectionId: group.sectionId,
      })
    );

    const result = await publisher.publishResults({
      studentIds: group.studentIds,
      // `examId` here is the TERM id (`sm_exam_types`), NOT `sm_exams.id` — the parameter name
      // is misleading. The value flows publishResults -> getStudentResult({ examId }) ->
      // queryResultData(student, examId), which binds it to `sm_result_stores.exam_type_id`,
      // `teacher_remarks.exam_type_id` and `getCurrentTerm(examId)`. Legacy callers pass a term
      // id too (`assessment.remote.ts:74` passes a variable literally named `examTypeId`).
      // The id spaces overlap — id 5 is "FIRST TERM..." in `sm_exam_types` and an unrelated
      // per-subject row in `sm_exams` — so an `sm_exams.id` here would silently publish the
      // wrong term rather than fail.
      examId: input.examTypeId,
      resend: true,
    });

    for (const row of result.results) {
      if (typeof row.studentId === "number") sentIds.add(row.studentId);
    }
    for (const studentId of group.studentIds) {
      if (sentIds.has(studentId)) continue;
      const reason = result.errors.find((error) => error.includes(`Student ${studentId}`));
      if (reason) failureReasons.set(studentId, reason);
    }
  }

  for (const studentId of eligible) {
    if (sentIds.has(studentId)) {
      await markScanPublished({
        studentId,
        examTypeId: input.examTypeId,
        academicId: input.academicId,
      });
      outcomes.push({ studentId, status: "published" });
      continue;
    }
    outcomes.push({
      studentId,
      status: "failed",
      message: failureReasons.get(studentId) ?? "Publish did not report this student",
    });
  }

  return {
    outcomes,
    sent: sentIds.size,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    skipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
  };
}
