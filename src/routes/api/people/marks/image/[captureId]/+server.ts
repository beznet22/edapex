import { error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { assertScanScope } from "$lib/server/people/scan/scan-access";
import { readScanEnvelope, readScanFile } from "$lib/server/people/scan/scan-store";
import {
  guard,
  requireNumber,
  resolveScanRequest,
} from "$lib/server/people/scan/scan-request";

/**
 * Authenticated JPEG read. The file path comes from the stored envelope, never from the URL, so
 * a crafted `captureId` cannot select an arbitrary file — `resolveScanPath` additionally rejects
 * traversal and anything outside `storage/marks-scans`.
 */
export const GET: RequestHandler = async ({ params, url, locals }) =>
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

    if (!envelope?.document || envelope.captureId !== params.captureId) {
      error(404, "Scan image not found");
    }

    let bytes: Buffer;
    try {
      bytes = await readScanFile(envelope.document.path);
    } catch {
      error(404, "Scan image is unavailable");
    }

    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(bytes.length),
        "cache-control": "private, max-age=300",
      },
    });
  });
