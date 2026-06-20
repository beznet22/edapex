import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { RequestContext } from "@mastra/core/request-context";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import { assertParentOwnsStudent } from "../../internal/parent-permissions";
import { base64url, readParentContext, toTenantContext } from "./index";

export const downloadChildPdfTool = createTool({
  id: "download-child-pdf",
  description:
    "Return a public URL pointing to the rendered report-card PDF for a given " +
    "child and exam type. Verifies the file exists in the tenant workspace " +
    "before returning a tokenized URL.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    examTypeId: z.number().int().positive().describe("Numeric ID of the exam type"),
  }),
  outputSchema: z.object({
    url: z.string(),
    storagePath: z.string(),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParentOwnsStudent(parent, input.studentId);

    const tenant = toTenantContext(parent);
    const storagePath = `exams/examType-${input.examTypeId}/pdfs/${input.studentId}.pdf`;

    const requestContext = new RequestContext();
    requestContext.set("tenantContext", { ...tenant, examTypeId: input.examTypeId });
    const fs = await tenantWorkspace.resolveFilesystem({ requestContext });
    if (!fs) {
      throw new Error("WORKSPACE_UNAVAILABLE: tenant workspace filesystem is not configured");
    }
    const exists = await fs.exists(storagePath);
    if (!exists) {
      throw new Error(
        `PDF_NOT_READY: no rendered report card at ${storagePath} for studentId=${input.studentId}`,
      );
    }

    const token = base64url(JSON.stringify({ studentId: input.studentId, examTypeId: input.examTypeId }));
    return {
      url: `/api/results/${token}`,
      storagePath,
    };
  },
});