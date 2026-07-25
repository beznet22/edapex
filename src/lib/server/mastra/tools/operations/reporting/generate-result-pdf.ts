import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import { marksheetPdfPath } from "$lib/server/workspace/paths";
import { addEntry } from "$lib/server/workspace/manifest";
import { type MemoryContext } from "$lib/server/mastra/utils/chat-utils";
import { renderResultPdfCore } from "./generate-result-pdf-core";
import {
  base64url,
  emitPdfPart,
  getTenant,
  getWriter,
  resolveFilesystem,
  sanitizeForFilename,
  studentCriteriaBase,
  type PdfArtifactData,
} from "./_shared";
import type { WorkspaceFilesystem } from "@mastra/core/workspace";

const reportPdfInputSchema = z.object({
  ...studentCriteriaBase,
  includePdfBuffer: z.boolean().optional(),
});

const reportPdfOutputSchema = z.object({
  artifactId: z.string(),
  kind: z.literal("pdf"),
  status: z.enum(["success", "error"]),
  title: z.string().optional(),
  storagePath: z.string().optional(),
  previewUrl: z.string().optional(),
  error: z.string().optional(),
  pdfBase64: z.string().optional(),
  filename: z.string().optional(),
});

type CoreRenderResult = {
  ok: boolean;
  artifactId: string;
  title: string;
  storagePath: string;
  previewUrl: string;
  pdfBuffer?: Buffer;
  error?: string;
};

async function readPdfBuffer(
  fs: WorkspaceFilesystem,
  storagePath: string,
): Promise<Buffer> {
  const bytes = await fs.readFile(storagePath);
  if (Buffer.isBuffer(bytes)) return bytes;
  if (typeof bytes === "string") return Buffer.from(bytes, "binary");
  return Buffer.from(bytes);
}

export const generateResultPdfTool = createTool({
  id: "generate-result-pdf",
  description:
    "Generate the PDF result for a student. Resolves the student by id/admissionNo/fullName within the active class/section, fetches the marksheet via AssessmentService, validates it through marksheetSchema, server-renders ResultTemplate.svelte, and emits the PDF via html2pdf. Emits data-generatePDF parts.",
  inputSchema: reportPdfInputSchema,
  outputSchema: reportPdfOutputSchema,
  execute: async (input, ctx) => {
    const context = ctx as Parameters<typeof getTenant>[0];
    const tenant: TenantContext = getTenant(context);
    const writer: StreamWriterLike | undefined = getWriter(context);

    const threadId = context.requestContext?.get("threadId") as string | undefined;
    const resourceId = context.requestContext?.get("resourceId") as string | undefined;
    const memCtx: MemoryContext | undefined =
      threadId && resourceId ? { threadId, resourceId } : undefined;

    const examTypeId = input.examTypeId ?? tenant.examTypeId;
    if (examTypeId === null || examTypeId === undefined) {
      const message = "EXAM_TYPE_REQUIRED: no examTypeId in input or active tenant";
      return {
        artifactId: `pdf-${input.studentId ?? input.admissionNo ?? 0}-0`,
        kind: "pdf" as const,
        status: "error" as const,
        title: `${sanitizeForFilename(input.fullName ?? "student")}.pdf`,
        error: message,
      };
    }

    const previewTitle = sanitizeForFilename(input.fullName ?? "student");
    const provisionalArtifactId = `pdf-${input.studentId ?? input.admissionNo ?? 0}-${examTypeId}`;
    const provisionalTitle = `${previewTitle}.pdf`;

    let studentId: number;
    try {
      studentId = await resolveStudentId(tenant, input, examTypeId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await emitPdfPart(writer, memCtx, provisionalArtifactId, {
        status: "error",
        data: "",
        title: provisionalTitle,
        id: provisionalArtifactId,
        error: message,
      } as PdfArtifactData);
      return {
        artifactId: provisionalArtifactId,
        kind: "pdf" as const,
        status: "error" as const,
        title: provisionalTitle,
        error: message,
      };
    }

    await emitPdfPart(writer, memCtx, provisionalArtifactId, {
      status: "processing",
      data: "",
      title: provisionalTitle,
      id: provisionalArtifactId,
    } as PdfArtifactData);

    const rendered = await renderResultPdfCore({
      tenant,
      studentId,
      examTypeId,
      academicId: tenant.academicId,
    });

    if (!rendered.ok) {
      await emitPdfPart(writer, memCtx, provisionalArtifactId, {
        status: "error",
        data: "",
        title: provisionalTitle,
        id: provisionalArtifactId,
        error: rendered.message,
      } as PdfArtifactData);
      return {
        artifactId: provisionalArtifactId,
        kind: "pdf" as const,
        status: "error" as const,
        title: provisionalTitle,
        error: rendered.message,
      };
    }

    const fs = await resolveFilesystem(tenant);
    const storagePath = marksheetPdfPath(
      studentId,
      rendered.studentAdmissionNo,
      rendered.studentFullName,
      examTypeId,
    );
    await fs.writeFile(storagePath, new Uint8Array(rendered.pdfBuffer), {
      recursive: true,
      overwrite: true,
    });
    await addEntry(
      tenant,
      {
        path: storagePath,
        kind: "marksheet-pdf",
        status: "Generated",
        studentId,
        examTypeId,
        uploadedAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        mimeType: "application/pdf",
      },
      examTypeId,
    );

    const token = base64url(JSON.stringify({ studentId, examTypeId }));
    const previewUrl = `/api/results/${token}`;

    await emitPdfPart(writer, memCtx, provisionalArtifactId, {
      status: "success",
      data: previewUrl,
      title: rendered.filename,
      id: provisionalArtifactId,
      storagePath,
      previewUrl,
    } as PdfArtifactData);

    const result: CoreRenderResult = {
      ok: true,
      artifactId: provisionalArtifactId,
      title: rendered.filename,
      storagePath,
      previewUrl,
      pdfBuffer: rendered.pdfBuffer,
    };
    return {
      artifactId: result.artifactId,
      kind: "pdf" as const,
      status: "success" as const,
      title: result.title,
      storagePath: result.storagePath,
      previewUrl: result.previewUrl,
      ...(result.pdfBuffer
        ? {
            pdfBase64: result.pdfBuffer.toString("base64"),
            filename: result.title,
          }
        : {}),
    };
  },
});

async function resolveStudentId(
  tenant: TenantContext,
  input: z.infer<typeof reportPdfInputSchema>,
  examTypeId: number,
): Promise<number> {
  if (input.studentId !== undefined && input.studentId !== null) {
    return input.studentId;
  }
  if (input.admissionNo !== undefined && input.admissionNo !== null) {
    return input.admissionNo;
  }
  // Caller did not specify a studentId. Fall back to the most recent
  // marksheet-pdf manifest entry for this class/section/examType.
  if (tenant.classId === null || tenant.sectionId === null) {
    throw new Error(
      "STUDENT_NOT_FOUND: generate-result-pdf requires studentId, admissionNo, or an active class/section tenant",
    );
  }
  throw new Error(
    `STUDENT_NOT_FOUND: generate-result-pdf web path requires an explicit studentId for examTypeId=${examTypeId}`,
  );
}
