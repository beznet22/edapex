import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { assertScanScope } from "$lib/server/people/scan/scan-access";
import { CommitRejectedError, commitScan } from "$lib/server/people/scan/scan-commit";
import {
  assertSameOrigin,
  guard,
  resolveScanRequest,
  ScanRequestError,
} from "$lib/server/people/scan/scan-request";
import { marksheetSchema } from "$lib/schema/marksheet";

export const POST: RequestHandler = async ({ request, url, locals }) =>
  guard(async () => {
    assertSameOrigin(request, url.origin);
    const context = await resolveScanRequest({ user: locals.user, url });

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      throw new ScanRequestError("Invalid request body", 400);
    }
    const { studentId, examTypeId, marksheet } = body as {
      studentId?: unknown;
      examTypeId?: unknown;
      marksheet?: unknown;
    };

    const numericStudentId = Number(studentId);
    const numericExamTypeId = Number(examTypeId);
    if (!Number.isInteger(numericStudentId) || numericStudentId <= 0) {
      throw new ScanRequestError("Invalid studentId", 400);
    }
    if (!Number.isInteger(numericExamTypeId) || numericExamTypeId <= 0) {
      throw new ScanRequestError("Invalid examTypeId", 400);
    }

    await assertScanScope({
      user: locals.user,
      studentId: numericStudentId,
      examTypeId: numericExamTypeId,
      schoolId: context.schoolId,
      academicId: context.academicId,
      allowedClassSections: context.allowedClassSections,
    });

    const parsed = await marksheetSchema.safeParseAsync(marksheet);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      return json({ error: "Invalid marksheet", issues: detail }, { status: 400 });
    }

    try {
      const result = await commitScan({
        studentId: numericStudentId,
        examTypeId: numericExamTypeId,
        schoolId: context.schoolId,
        academicId: context.academicId,
        staffId: context.staffId,
        userId: context.user.id,
        marksheet: parsed.data,
      });

      return json({
        status: result.status,
        studentId: numericStudentId,
        recordId: result.recordId,
        warnings: result.warnings,
      });
    } catch (cause) {
      if (cause instanceof CommitRejectedError) {
        const status =
          cause.code === "NOT_FOUND"
            ? 404
            : cause.code === "VALIDATION" || cause.code === "STALE"
              ? 422
              : 500;
        return json({ error: cause.message, code: cause.code }, { status });
      }
      throw cause;
    }
  });
