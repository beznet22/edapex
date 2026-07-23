import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { render } from "svelte/server";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { generate as generatePdf } from "$lib/server/helpers/pdf-generator";
import { pageToHtml } from "$lib/server/helpers";
import { marksheetSchema, type Marksheet } from "$lib/schema/marksheet";
import { padMissingRecords } from "./marksheet/validate-cross-ref";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import {
  _resolveStudentSession,
  base64url,
  emitPdfPart,
  getTenant,
  getWriter,
  resolveFilesystem,
  resolveStudent,
  sanitizeForFilename,
  studentCriteriaBase,
  type PdfArtifactData,
} from "$lib/server/mastra/tools/operations/reporting/_shared";
import { marksheetPdfPath } from "$lib/server/workspace/paths";
import { addEntry, readManifest } from "$lib/server/workspace/manifest";
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import { type MemoryContext } from "$lib/server/mastra/utils/chat-utils";

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

type CoreRenderArgs = {
  tenant: TenantContext;
  writer: StreamWriterLike | undefined;
  input: z.infer<typeof reportPdfInputSchema>;
};

type CoreRenderResult = {
  ok: boolean;
  artifactId: string;
  title: string;
  storagePath: string;
  previewUrl: string;
  pdfExists: boolean;
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

async function renderAndWriteResultPdf(args: CoreRenderArgs): Promise<CoreRenderResult> {
  const { tenant, writer, input } = args;

  const examTypeId = input.examTypeId ?? tenant.examTypeId;
  if (examTypeId === null || examTypeId === undefined) {
    throw new Error("EXAM_TYPE_REQUIRED: no examTypeId in input or active tenant");
  }

  const student = await resolveStudent(
    tenant,
    {
      studentId: input.studentId,
      admissionNo: input.admissionNo,
      fullName: input.fullName,
      partialName: input.partialName,
      classId: input.classId,
      sectionId: input.sectionId,
    },
    tenant.classId,
    tenant.sectionId,
  );

  // If the tenant lacks classId/sectionId/schoolId, resolve them from student_records
  // so the PDF lands in the correct class sandbox instead of failing with
  // a MissingTenantScopeError.
  let resolvedTenant = tenant;
  if (tenant.classId === null || tenant.sectionId === null || tenant.schoolId === 0) {
    const session = await _resolveStudentSession(student.studentId, tenant.academicId);
    if (session !== null && session.classId !== null && session.sectionId !== null) {
      resolvedTenant = {
        ...tenant,
        classId: session.classId,
        sectionId: session.sectionId,
        schoolId: session.schoolId ?? tenant.schoolId,
        academicId: session.academicId ?? tenant.academicId,
      };
      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[generate-result-pdf] resolved session for studentId=${student.studentId}: ` +
          `classId=${session.classId}, sectionId=${session.sectionId}`,
        );
      }
    } else {
      // Bug 3 fix: emit NO_STUDENT_SESSION error event instead of silently
      // writing the PDF. (Replaces the legacy fallback that wrote to a
      // shared `_system/` sandbox.)
      const fullName = student.fullName ?? "student";
      const title = `${sanitizeForFilename(fullName)}.pdf`;
      const artifactId = `pdf-${student.studentId}-${examTypeId}`;
      const msg = `NO_STUDENT_SESSION: no active student_records row for studentId=${student.studentId}, academicId=${tenant.academicId ?? "?"}`;
      console.warn(`[generate-result-pdf] ${msg}`);
      await emitPdfPart(writer, undefined, artifactId, {
        status: "error",
        data: "",
        title,
        id: artifactId,
        storagePath: "",
        error: msg,
      } as PdfArtifactData);
      return {
        ok: false,
        artifactId,
        title,
        storagePath: "",
        previewUrl: "",
        pdfExists: false,
        error: msg,
      };
    }
  }

  const fullName = student.fullName ?? "student";
  const title = `${sanitizeForFilename(fullName)}.pdf`;
  const artifactId = `pdf-${student.studentId}-${examTypeId}`;
  const storagePath = marksheetPdfPath(student.studentId, student.admissionNo, student.fullName, examTypeId);
  const fs = await resolveFilesystem(resolvedTenant);

  await emitPdfPart(writer, undefined, artifactId, {
    status: "processing",
    data: "",
    title,
    id: artifactId,
    storagePath,
  });

  const assessment = await createAssessmentServiceForRequest(resolvedTenant);
  const fullResult = await assessment.getStudentResult({
    id: student.studentId,
    examId: examTypeId,
    isAdminNo: false,
    withImages: true,
  });

  if (!fullResult) {
    throw new Error(
      `MARKSHEET_NOT_FOUND: no marksheet data for studentId=${student.studentId}, examId=${examTypeId}`,
    );
  }

  // Pad missing records so the PDF includes all assigned subjects,
  // even if the commit didn't create records for recently-added subjects.
  // Omitted subjects are stripped before rendering.
  let validated: Marksheet;
  if (resolvedTenant.classId != null && resolvedTenant.sectionId != null) {
    try {
      const assigned = await assessment.getAssignedSubjects(resolvedTenant.classId, resolvedTenant.sectionId);
      // Read omitted/allowed subject IDs from manifest
      let omitSet: Set<number> | undefined;
      let allowSet: Set<number> | undefined;
      try {
        const m = await readManifest(resolvedTenant, examTypeId);
        const entry = Object.values(m.entries).find(
          e => e.studentId === student.studentId && e.path?.includes('/marksheets/') && e.path?.endsWith('.md'),
        );
        if (entry?.omittedSubjectIds?.length) omitSet = new Set(entry.omittedSubjectIds);
        if (entry?.allowedSubjectIds?.length) allowSet = new Set(entry.allowedSubjectIds);
      } catch { /* best-effort */ }
      const padded = padMissingRecords(fullResult as Marksheet, assigned, omitSet);
      validated = await marksheetSchema.parseAsync(padded);
    } catch {
      validated = await marksheetSchema.parseAsync(fullResult);
    }
  } else {
    validated = await marksheetSchema.parseAsync(fullResult);
  }

  const { body, head } = render(ResultTemplate, { props: { data: validated } });
  const html = pageToHtml(body, head);
  const fileBase = `res_${sanitizeForFilename(fullName)}_a${student.admissionNo ?? 0}_e${examTypeId}_${Date.now()}`;

  const generated = await generatePdf({ htmlContent: html, fileName: fileBase });
  if (!generated.success || !generated.pdfBuffer) {
    throw new Error(
      `PDF_RENDER_FAILED: ${generated.error ?? "unknown html2pdf error"}`,
    );
  }
  const pdfBuffer = generated.pdfBuffer;

  await fs.writeFile(storagePath, new Uint8Array(pdfBuffer), {
    recursive: true,
    overwrite: true,
  });
  await addEntry(
    resolvedTenant,
    {
      path: storagePath,
      kind: 'marksheet-pdf',
      status: 'Generated',
      studentId: student.studentId,
      examTypeId,
      uploadedAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      mimeType: 'application/pdf'
    },
    examTypeId
  );

  const token = base64url(JSON.stringify({ studentId: student.studentId, examTypeId }));
  const previewUrl = `/api/results/${token}`;

  await emitPdfPart(writer, undefined, artifactId, {
    status: "success",
    data: previewUrl,
    title,
    id: artifactId,
    storagePath,
    previewUrl,
  });

  const result: CoreRenderResult = {
    ok: true,
    artifactId,
    title,
    storagePath,
    previewUrl,
    pdfExists: true,
  };
  if (input.includePdfBuffer === true) {
    result.pdfBuffer = await readPdfBuffer(fs, storagePath);
  }
  return result;
}

export const generateResultPdfTool = createTool({
  id: "generate-result-pdf",
  description:
    "Generate the PDF result for a student. Resolves the student by id/admissionNo/fullName within the active class/section, fetches the marksheet via AssessmentService, validates it through marksheetSchema, server-renders ResultTemplate.svelte, and emits the PDF via html2pdf. Emits data-generatePDF parts.",
  inputSchema: reportPdfInputSchema,
  outputSchema: reportPdfOutputSchema,
  execute: async (input, ctx) => {
    const context = ctx as Parameters<typeof getTenant>[0];
    const tenant = getTenant(context);
    const writer = getWriter(context);

    const threadId = context.requestContext?.get('threadId') as string | undefined;
    const resourceId = context.requestContext?.get('resourceId') as string | undefined;
    const memCtx: MemoryContext | undefined = threadId && resourceId
      ? { threadId, resourceId }
      : undefined;

    const examTypeId = input.examTypeId ?? tenant.examTypeId;
    const previewTitle = sanitizeForFilename(input.fullName ?? "student");
    const provisionalArtifactId = `pdf-${input.studentId ?? input.admissionNo ?? 0}-${examTypeId ?? 0}`;
    const provisionalTitle = `${previewTitle}.pdf`;

    try {
      const rendered = await renderAndWriteResultPdf({
        tenant,
        writer,
        input,
      });
      return {
        artifactId: rendered.artifactId,
        kind: "pdf" as const,
        status: "success" as const,
        title: rendered.title,
        storagePath: rendered.storagePath,
        previewUrl: rendered.previewUrl,
        ...(rendered.pdfBuffer
          ? {
            pdfBase64: rendered.pdfBuffer.toString("base64"),
            filename: rendered.title,
          }
          : {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await emitPdfPart(writer, memCtx, provisionalArtifactId, {
        status: "error",
        data: "",
        title: provisionalTitle,
        id: provisionalArtifactId,
        error: message,
      });
      return {
        artifactId: provisionalArtifactId,
        kind: "pdf" as const,
        status: "error" as const,
        title: provisionalTitle,
        error: message,
      };
    }
  },
});
