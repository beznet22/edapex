import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { assertScanScope } from "$lib/server/people/scan/scan-access";
import { readScanEnvelope } from "$lib/server/people/scan/scan-store";
import { guard, requireNumber, resolveScanRequest } from "$lib/server/people/scan/scan-request";

/**
 * Reads a marksheet back for the review grid.
 *
 * Two sources, in order of authority:
 *
 * 1. **The scan envelope** (`teacher_remarks.metadata`) — a draft the scanner produced, or a row
 *    the scanner committed. This is the working copy and it wins.
 * 2. **The committed result** via `getStudentResult` — for the ~648 students whose marks predate
 *    this feature. Those rows have real `sm_result_stores` / `sm_mark_stores` data but no envelope,
 *    because the column did not exist when they were saved. Without this fallback `View Mark`
 *    showed an empty grid for almost every student in the school.
 *
 * Neither present means the student genuinely has nothing to review.
 */
export const GET: RequestHandler = async ({ url, locals }) =>
  guard(async () => {
    const context = await resolveScanRequest({ user: locals.user, url });
    const studentId = requireNumber(url.searchParams.get("student"), "student");
    const examTypeId = requireNumber(url.searchParams.get("exam"), "exam");

    await assertScanScope({
      user: locals.user,
      studentId,
      examTypeId,
      schoolId: context.schoolId,
      academicId: context.academicId,
      allowedClassSections: context.allowedClassSections,
    });

    const envelope = await readScanEnvelope({
      studentId,
      examTypeId,
      academicId: context.academicId,
    });

    // A scanner envelope is authoritative — it may hold uncommitted edits the result rows lack.
    if (envelope?.marksheet) {
      return json(
        {
          status: envelope.status,
          marksheet: envelope.marksheet,
          warnings: envelope.validation.warnings,
          errors: envelope.validation.errors,
          lowConfidence: envelope.validation.lowConfidence,
          failure: envelope.failure,
          captureId: envelope.captureId,
          // `published` is read-only: changing a result a parent already received must go through
          // `Edit & Re-publish`, which re-sends the PDF.
          readOnly: envelope.status === "published",
          imageUrl:
            envelope.document && envelope.status !== "queued"
              ? `/api/people/marks/image/${envelope.captureId}?student=${studentId}&exam=${examTypeId}`
              : null,
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    // Fall back to whatever is already committed. `examId` here is the TERM id (`sm_exam_types`),
    // not `sm_exams.id` — see the note in scan-publish.ts.
    const assessment = await createAssessmentServiceForRequest(
      createTenantContext({
        schoolId: context.schoolId,
        userId: context.user.id,
        staffId: context.user.staffId,
        academicId: context.academicId,
        examTypeId,
        studentId,
      })
    );
    const committed = await assessment.getStudentResult({
      id: studentId,
      examId: examTypeId,
      withImages: true,
    });

    if (committed) {
      const published = envelope?.status === "published";
      return json(
        {
          // Presented as `committed` unless the envelope says published; either way the marks
          // exist, which is what the grid needs to render.
          status: published ? "published" : "committed",
          marksheet: committed,
          warnings: [],
          errors: [],
          lowConfidence: [],
          failure: null,
          captureId: envelope?.captureId ?? null,
          readOnly: published,
          imageUrl: null,
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    return json(
      {
        status: envelope?.status ?? "not_uploaded",
        marksheet: null,
        warnings: [],
        errors: [],
        lowConfidence: [],
        failure: envelope?.failure ?? null,
        captureId: envelope?.captureId ?? null,
        readOnly: false,
        imageUrl: null,
      },
      { headers: { "cache-control": "no-store" } }
    );
  });
