import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { assertScanScope } from "$lib/server/people/scan/scan-access";
import { readScanEnvelope } from "$lib/server/people/scan/scan-store";
import {
  guard,
  requireNumber,
  resolveScanRequest,
} from "$lib/server/people/scan/scan-request";

/**
 * Reads one student's draft envelope back for the review grid.
 *
 * Lives under `/api/` for the same reason every other marks route does: `service-worker.ts`
 * bypasses caching for `/api/` only, so a cached response could show a stale draft.
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

    if (!envelope) {
      return json(
        { status: "not_uploaded", marksheet: null, warnings: [], errors: [] },
        { headers: { "cache-control": "no-store" } }
      );
    }

    return json(
      {
        status: envelope.status,
        marksheet: envelope.marksheet,
        warnings: envelope.validation.warnings,
        errors: envelope.validation.errors,
        lowConfidence: envelope.validation.lowConfidence,
        failure: envelope.failure,
        captureId: envelope.captureId,
        // Exposed so the grid can show the page beside the marks and warn on a name mismatch.
        imageUrl:
          envelope.document && envelope.status !== "queued"
            ? `/api/people/marks/image/${envelope.captureId}?student=${studentId}&exam=${examTypeId}`
            : null,
      },
      { headers: { "cache-control": "no-store" } }
    );
  });
