import { error, json } from "@sveltejs/kit";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { resolveActiveClassScope, resolveClassNamesByIds } from "$lib/server/helpers/class-scope";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { publishResultPdfTool } from "$lib/server/mastra/tools/operations/reporting/publish-result-pdf";
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

    const executeFn = publishResultPdfTool.execute;
    if (typeof executeFn !== "function") {
      throw new Error("TOOL_EXECUTE_UNAVAILABLE: publishResultPdfTool.execute is not bound");
    }
    const result = await executeFn(
      {
        studentId: body.studentId,
        examTypeId: body.examTypeId,
        academicId: body.academicId ?? scope?.academicId ?? undefined,
        admissionNo: body.admissionNo,
        fullName: body.fullName,
      },
      { requestContext: requestContext as never } as never,
    );

    if (typeof result === "object" && result !== null && "status" in result) {
      const r = result as { status: string; artifactId: string; publicationUrl?: string; messageId?: string; parentEmail?: string; parentName?: string; error?: string };
      return json({
        status: r.status,
        artifactId: r.artifactId,
        publicationUrl: r.publicationUrl,
        messageId: r.messageId,
        parentEmail: r.parentEmail,
        parentName: r.parentName,
        error: r.error,
      });
    }

    return json({ status: "failed", error: "Unexpected tool response" }, { status: 500 });
  } catch (e) {
    console.error("[publish-pdf]", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ status: "failed", error: message }, { status: 500 });
  }
};
