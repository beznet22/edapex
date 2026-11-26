import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { assertScanScope } from "$lib/server/people/scan/scan-access";
import {
  CaptureRejectedError,
  MAX_CAPTURE_BYTES,
  prepareCapture,
} from "$lib/server/people/scan/scan-capture";
import {
  guard,
  requireNumber,
  resolveScanRequest,
  ScanRequestError,
  assertSameOrigin,
} from "$lib/server/people/scan/scan-request";
import { readScanEnvelope, writeScanEnvelope } from "$lib/server/people/scan/scan-store";
import { parseEnvelope } from "$lib/server/people/scan/scan-types";
import { canRecapture } from "$lib/server/people/scan/scan-status";

const formNumber = (form: FormData, key: string): number => {
  const raw = form.get(key);
  if (typeof raw !== "string") throw new ScanRequestError(`Missing ${key}`, 400);
  return requireNumber(raw, key);
};

export const POST: RequestHandler = async ({ request, url, locals }) =>
  guard(async () => {
    assertSameOrigin(request, url.origin);

    const context = await resolveScanRequest({ user: locals.user, url });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ScanRequestError("Missing image file", 400);
    }
    if (file.size > MAX_CAPTURE_BYTES) {
      throw new ScanRequestError("Image is too large", 413);
    }

    const studentId = formNumber(form, "studentId");
    const examTypeId = formNumber(form, "examTypeId");
    const classId = formNumber(form, "classId");
    const sectionId = formNumber(form, "sectionId");
    const captureIdRaw = form.get("captureId");
    const captureId = typeof captureIdRaw === "string" && captureIdRaw.trim() !== ""
      ? captureIdRaw.trim()
      : undefined;
    const sourceRaw = form.get("source");
    const source = sourceRaw === "rescan" ? "rescan" : "camera";

    await assertScanScope({
      user: locals.user,
      studentId,
      examTypeId,
      schoolId: context.schoolId,
      academicId: context.academicId,
      allowedClassSections: context.allowedClassSections,
    });

    const existing = await readScanEnvelope({
      studentId,
      examTypeId,
      academicId: context.academicId,
    });
    if (captureId && existing?.captureId === captureId) {
      return json({ captureId, status: existing.status, duplicate: true }, { status: 202 });
    }

    /**
     * A new capture replaces the current draft, which is what `Re-scan` means. It must not replace
     * a *verified* result though: doing so would drop a committed marksheet back to `queued` and
     * discard the teacher's edits. Editing a published row is its own flow (`Edit & Re-publish`).
     */
    if (existing && !canRecapture(existing.status)) {
      throw new ScanRequestError(
        `This student's marks are already ${existing.status}. Use Edit & Re-publish to change them.`,
        409
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    let prepared;
    try {
      prepared = await prepareCapture({
        bytes,
        studentId,
        examTypeId,
        schoolId: context.schoolId,
        academicId: context.academicId,
        classId,
        sectionId,
        captureId,
        source,
      });
    } catch (cause) {
      if (cause instanceof CaptureRejectedError) {
        throw new ScanRequestError(cause.message, cause.code === "TOO_LARGE" ? 413 : 415);
      }
      throw cause;
    }

    const envelope = parseEnvelope(prepared.metadata);
    if (!envelope) throw new ScanRequestError("Could not build capture envelope", 500);

    await writeScanEnvelope({
      studentId,
      examTypeId,
      academicId: context.academicId,
      envelope,
    });

    return json(
      {
        captureId: prepared.captureId,
        status: envelope.status,
        path: prepared.path,
        bytes: prepared.bytes,
      },
      { status: 202 }
    );
  });
