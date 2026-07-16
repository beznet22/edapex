import { error, json } from "@sveltejs/kit";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { buildRequestContext } from "$lib/server/helpers/chat-helper";
import { resolveActiveClassScope, resolveClassNamesByIds } from "$lib/server/helpers/class-scope";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { validateMarksheetTool } from "$lib/server/mastra/tools/operations/reporting/marksheet/validate-marksheet";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import type { RequestHandler } from "@sveltejs/kit";

type SuccessResult = {
  ok: true;
  json: unknown;
  persistedMarkdownPath: string;
  validatedTitle: string;
  marksheetStatus: string;
  parentName?: string | null;
  parentEmail?: string | null;
};

type FailureResult = {
  ok: false;
  errors: Array<{ path: string; message: string; code: string }>;
  unresolvedErrors: Array<{ path: string; message: string; code: string }>;
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    if (!locals.user) throw error(401, "Unauthorized");

    const body = await request.json() as {
      studentId?: number | null;
      examTypeId?: number | null;
      academicId?: number | null;
      admissionNo?: number | null;
      fullName?: string | null;
      currentMarkdownPath: string;
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
      examTypeId: body.examTypeId ?? null,
      academicId: scope?.academicId ?? null,
      className: displayNames.className,
      sectionName: displayNames.sectionName,
      academicYearTitle: displayNames.academicYearTitle,
    });

    const selectedChatModel = cookies.get("selected-model") ?? "";

    const requestContext = await buildRequestContext({
      context: tenant,
      userId: tenant.userId,
      modelId: selectedChatModel,
      isSlashCommand: false,
      lastMessage: "Validate marksheet",
    });
    requestContext.set("autoFixAttempts", 0);

    const executeFn = validateMarksheetTool.execute;
    if (typeof executeFn !== "function") {
      throw new Error("TOOL_EXECUTE_UNAVAILABLE: validateMarksheetTool.execute is not bound");
    }

    const rawResult = await executeFn(
      {
        currentMarkdownPath: body.currentMarkdownPath,
        student: body.studentId
          ? { id: body.studentId, fullName: body.fullName ?? "", admissionNo: body.admissionNo ?? undefined }
          : undefined,
        reason: "Validate marksheet from ArtifactViewer",
        title: body.fullName ? `${body.fullName} — Result` : undefined,
      },
      { requestContext: requestContext as never } as never,
    );

    const result = rawResult as SuccessResult | FailureResult;

    if (result.ok) {
    return json({
      ok: true,
      persistedMarkdownPath: result.persistedMarkdownPath,
      validatedTitle: result.validatedTitle,
      marksheetStatus: result.marksheetStatus,
      studentId: body.studentId ?? null,
      examTypeId: body.examTypeId ?? null,
      academicId: body.academicId ?? tenant.academicId ?? null,
      parentName: result.parentName ?? null,
      parentEmail: result.parentEmail ?? null,
    });
    }

    const errors = result.unresolvedErrors ?? result.errors ?? [];

    const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
    let rawMarkdown = "";
    if (fs && await fs.exists(body.currentMarkdownPath)) {
      const raw = await fs.readFile(body.currentMarkdownPath, { encoding: "utf-8" });
      rawMarkdown = typeof raw === "string" ? raw : raw.toString("utf-8");
    }

    const { mastra } = await import("$lib/server/mastra");
    const documentAgent = mastra.getAgent("document");
    if (!documentAgent) {
      throw new Error("AGENT_NOT_REGISTERED: document agent is not registered on the Mastra instance");
    }

    const explanationPrompt = [
      `The following marksheet validation FAILED.`,
      ``,
      `## Student Context`,
      `  - studentId: ${body.studentId ?? "unknown"}`,
      `  - fullName: ${body.fullName ?? "unknown"}`,
      `  - admissionNo: ${body.admissionNo ?? "unknown"}`,
      `  - examTypeId: ${body.examTypeId ?? "unknown"}`,
      `  - academicId: ${body.academicId ?? tenant.academicId ?? "unknown"}`,
      ``,
      `## Validation Errors`,
      ...errors.map(
        (e) => `  - **${e.path}**: ${e.message} (code: \`${e.code}\`)`,
      ),
      ``,
      `## Raw Marksheet Content`,
      `\`\`\`markdown`,
      rawMarkdown || "(could not read file)",
      `\`\`\``,
      ``,
      `Explain these errors.`,
    ].join("\n");

    const explanationResponse = await documentAgent.generate(explanationPrompt, {
      requestContext: requestContext as never,
    });
    const explanation =
      (explanationResponse as { text?: string }).text ??
      (explanationResponse as { object?: unknown }).object ??
      "Validation failed. Please review the marksheet data and try again.";

    return json({
      ok: false,
      explanation: typeof explanation === "string" ? explanation : JSON.stringify(explanation),
      errors,
    });
  } catch (e) {
    console.error("[validate-marksheet]", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ ok: false, error: message }, { status: 500 });
  }
};
