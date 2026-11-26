import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { publishScans } from "$lib/server/people/scan/scan-publish";
import { assertScanScope } from "$lib/server/people/scan/scan-access";
import {
  assertSameOrigin,
  guard,
  resolveScanRequest,
  ScanRequestError,
} from "$lib/server/people/scan/scan-request";

const MAX_BATCH = 100;

export const POST: RequestHandler = async ({ request, url, locals }) =>
  guard(async () => {
    assertSameOrigin(request, url.origin);
    const context = await resolveScanRequest({ user: locals.user, url });

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      throw new ScanRequestError("Invalid request body", 400);
    }
    const { studentIds, examTypeId } = body as { studentIds?: unknown; examTypeId?: unknown };

    const numericExamTypeId = Number(examTypeId);
    if (!Number.isInteger(numericExamTypeId) || numericExamTypeId <= 0) {
      throw new ScanRequestError("Invalid examTypeId", 400);
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw new ScanRequestError("No students selected", 400);
    }
    if (studentIds.length > MAX_BATCH) {
      throw new ScanRequestError(`Publish at most ${MAX_BATCH} students at a time`, 400);
    }

    const ids = studentIds.map(Number);
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new ScanRequestError("Invalid student id in selection", 400);
    }

    // Every student is authorised individually: a teacher cannot publish outside their classes
    // by mixing one allowed id with others.
    for (const studentId of ids) {
      await assertScanScope({
        user: locals.user,
        studentId,
        examTypeId: numericExamTypeId,
        schoolId: context.schoolId,
        academicId: context.academicId,
        allowedClassSections: context.allowedClassSections,
      });
    }

    const result = await publishScans({
      studentIds: ids,
      examTypeId: numericExamTypeId,
      schoolId: context.schoolId,
      academicId: context.academicId,
      staffId: context.staffId,
      userId: context.user.id,
    });

    return json(result);
  });
