import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { resolveTenantWorkspace } from "$lib/server/workspace/scope";
import { readManifest } from "$lib/server/workspace/manifest";
import { publishResultPdfTool } from "$lib/server/mastra/tools/operations/reporting/publish-result-pdf";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
  try {
    if (!locals.user) throw error(401, "Unauthorized");

    const filePath = url.searchParams.get("filePath");
    if (!filePath) throw error(400, "filePath query param required");

    const examTypeIdParam = url.searchParams.get("examTypeId");
    if (!examTypeIdParam) throw error(400, "examTypeId query param required");
    const examTypeId = Number(examTypeIdParam);
    if (!Number.isFinite(examTypeId)) throw error(400, "Invalid examTypeId");

    const resend = url.searchParams.get("resend") === "true";

    const { tenant, requestContext } = await resolveTenantWorkspace({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id ?? 1,
      staffId: (locals.user as { staffId?: number })?.staffId,
      designationId: (locals.user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
      selectedClassCookie: cookies.get("selected-class"),
      examTypeId,
    });

    const manifest = await readManifest(tenant, examTypeId);
    const entry = manifest.entries[filePath];
    if (!entry) throw error(404, "Entry not found in manifest — has the marksheet been saved?");

    if (!filePath.includes("marksheets/") || !filePath.endsWith(".md")) {
      throw error(400, "filePath must reference a marksheet (.md) file in the marksheets/ directory");
    }

    if (!entry.studentId) throw error(400, "Entry has no studentId");

    requestContext.set("tenantContext", tenant);

    const executeFn = publishResultPdfTool.execute;
    if (typeof executeFn !== "function") {
      throw new Error("TOOL_EXECUTE_UNAVAILABLE: publishResultPdfTool.execute is not bound");
    }

    const result = await executeFn(
      {
        studentId: entry.studentId,
        admissionNo: entry.admissionNo ?? undefined,
        examTypeId,
        academicId: entry.academicId ?? undefined,

        resend,
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
    console.error("[publish]", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ status: "failed", error: message }, { status: 500 });
  }
};
