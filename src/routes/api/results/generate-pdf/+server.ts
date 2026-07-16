import { error, json } from "@sveltejs/kit";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { resolveActiveClassScope, resolveClassNamesByIds } from "$lib/server/helpers/class-scope";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { generateResultPdfTool } from "$lib/server/mastra/tools/operations/reporting/generate-result-pdf";
import { getDatabase } from "$lib/server/db";
import { smStudents, smParents } from "$lib/server/db/sms-schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    if (!locals.user) throw error(401, "Unauthorized");

    const body = await request.json() as {
      studentId: number;
      examTypeId: number;
      academicId?: number;
      admissionNo?: number;
      fullName?: string;
    };

    const scope = await resolveActiveClassScope({
      schoolId: locals.user.schoolId ?? 1,
      staffId: (locals.user as { staffId?: number })?.staffId,
      selectedClassCookie: cookies.get("selected-class"),
    });

    const displayNames = scope
      ? await resolveClassNamesByIds({
          schoolId: locals.user.schoolId ?? 1,
          classId: scope.classId,
          sectionId: scope.sectionId,
          academicId: scope.academicId,
        })
      : { className: null, sectionName: null, academicYearTitle: null };

    const tenant = createTenantContext({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id ?? 1,
      designationId: (locals.user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
      staffId: (locals.user as { staffId?: number })?.staffId ?? 1,
      classId: scope?.classId ?? null,
      sectionId: scope?.sectionId ?? null,
      examId: null,
      examTypeId: body.examTypeId,
      academicId: scope?.academicId ?? null,
      className: displayNames.className,
      sectionName: displayNames.sectionName,
      academicYearTitle: displayNames.academicYearTitle,
    });

    const requestContext = buildWorkspaceRequestContext(tenant);
    requestContext.set("tenantContext", tenant);

    const executeFn = generateResultPdfTool.execute;
    if (typeof executeFn !== "function") {
      throw new Error("TOOL_EXECUTE_UNAVAILABLE: generateResultPdfTool.execute is not bound");
    }
    const result = await executeFn(
      {
        studentId: body.studentId,
        examTypeId: body.examTypeId,
        academicId: body.academicId ?? scope?.academicId ?? undefined,
        admissionNo: body.admissionNo,
        fullName: body.fullName,
        republish: true,
        includePdfBuffer: true,
      },
      { requestContext: requestContext as never } as never,
    );

    if (typeof result === "object" && result !== null && "status" in result && result.status === "error") {
      return json({ error: (result as { error?: string }).error ?? "PDF generation failed" }, { status: 500 });
    }

    const successResult = result as {
      artifactId: string;
      storagePath?: string;
      previewUrl?: string;
      pdfBase64?: string;
      filename?: string;
      title?: string;
    };

    const db = await getDatabase();
    const studentRow = await db
      .select({ parentId: smStudents.parentId })
      .from(smStudents)
      .where(eq(smStudents.id, body.studentId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    let parentName: string | null = null;
    let parentEmail: string | null = null;
    if (studentRow?.parentId != null) {
      const parent = await db
        .select({ guardiansName: smParents.guardiansName, guardiansEmail: smParents.guardiansEmail })
        .from(smParents)
        .where(eq(smParents.id, studentRow.parentId))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      if (parent) {
        parentName = parent.guardiansName;
        parentEmail = parent.guardiansEmail;
      }
    }

    return json({
      storagePath: successResult.storagePath,
      previewUrl: successResult.previewUrl,
      pdfBase64: successResult.pdfBase64,
      filename: successResult.filename ?? successResult.title ?? "result.pdf",
      parentName,
      parentEmail,
    });
  } catch (e) {
    console.error("[generate-pdf]", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ error: message }, { status: 500 });
  }
};
