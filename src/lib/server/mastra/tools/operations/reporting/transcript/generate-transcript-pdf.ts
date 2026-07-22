import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { render } from "svelte/server";
import { pageToHtml } from "$lib/server/helpers";
import { generate as generatePdf } from "$lib/server/helpers/pdf-generator";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import TranscriptTemplate from "$lib/components/template/TranscriptTemplate.svelte";
import {
  base64url,
  emitPdfPart,
  getTenant,
  getWriter,
  resolveFilesystem,
  resolveStudent,
  sanitizeForFilename,
  studentCriteriaBase,
} from "$lib/server/mastra/tools/operations/reporting/_shared";
import { transcriptPdfPath } from "$lib/server/workspace/paths";
import { addEntry, readManifest as readWorkspaceManifest, updateEntry } from "$lib/server/workspace/manifest";
import { type MemoryContext } from "$lib/server/mastra/utils/chat-utils";

const reportPdfInputSchema = z.object({
  ...studentCriteriaBase,
  republish: z.boolean().optional(),
});

const reportPdfOutputSchema = z.object({
  artifactId: z.string(),
  kind: z.literal("pdf"),
  status: z.enum(["success", "error"]),
  title: z.string().optional(),
  storagePath: z.string().optional(),
  previewUrl: z.string().optional(),
  error: z.string().optional(),
});

type CoreRenderArgs = {
  tenant: TenantContext;
  writer: StreamWriterLike | undefined;
  input: z.infer<typeof reportPdfInputSchema>;
  republish?: boolean;
};

type CoreRenderResult = {
  ok: boolean;
  artifactId: string;
  title: string;
  storagePath: string;
  previewUrl: string;
  pdfExists: boolean;
  error?: string;
};

async function renderAndWriteTranscriptPdf(args: CoreRenderArgs): Promise<CoreRenderResult> {
  const { tenant, writer, input, republish } = args;

  const academicId = input.academicId ?? tenant.academicId;
  if (academicId === null || academicId === undefined) {
    throw new Error("ACADEMIC_ID_REQUIRED: no academicId in input or active tenant");
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

  const fullName = student.fullName ?? "student";
  const title = `${sanitizeForFilename(fullName)}.pdf`;
  const artifactId = `pdf-transcript-${student.studentId}-${academicId}`;
  if (tenant.examTypeId == null) {
    throw new Error("EXAM_TYPE_REQUIRED: generate-transcript-pdf needs an active examTypeId");
  }
  const examTypeId = tenant.examTypeId;
  const storagePath = transcriptPdfPath(student.studentId, examTypeId);

  const fs = await resolveFilesystem(tenant);

  if (!republish) {
    await emitPdfPart(writer, undefined, artifactId, {
      status: "processing",
      data: "",
      title,
      id: artifactId,
      storagePath,
    });
  }

  const assessment = await createAssessmentServiceForRequest(tenant);
  const transcript = await assessment.getTranscript({
    studentId: student.studentId,
    academicId,
    withImages: true,
  });

  if (!transcript) {
    throw new Error(
      `TRANSCRIPT_NOT_FOUND: no transcript data for studentId=${student.studentId}, academicId=${academicId}`,
    );
  }

  const { body, head } = render(TranscriptTemplate, { props: { data: transcript } });
  const html = pageToHtml(body, head);
  const fileBase = `transcript_${sanitizeForFilename(fullName)}_a${student.admissionNo ?? 0}_y${academicId}_${Date.now()}`;

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
    tenant,
    {
      path: storagePath,
      kind: 'transcript-pdf',
      status: 'Generated',
      studentId: student.studentId,
      examTypeId,
      academicId,
      uploadedAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      mimeType: 'application/pdf'
    },
    examTypeId
  );

  const genManifest = await readWorkspaceManifest(tenant, examTypeId);
  const genSource = Object.values(genManifest.entries).find(
    (e) => e.kind === 'user-file' && e.studentId === student.studentId
  );
  if (genSource) {
    await updateEntry(tenant, genSource.path, { status: 'Committed' }, examTypeId);
  }

  const tokenPayload = { studentId: student.studentId, academicId, kind: "transcript" as const };
  const token = base64url(JSON.stringify(tokenPayload));
  const previewUrl = `/api/results/${token}`;

  if (!republish) {
    await emitPdfPart(writer, undefined, artifactId, {
      status: "success",
      data: previewUrl,
      title,
      id: artifactId,
      storagePath,
      previewUrl,
    });
  }

  return {
    ok: true,
    artifactId,
    title,
    storagePath,
    previewUrl,
    pdfExists: true,
  };
}

export const generateTranscriptPdfTool = createTool({
  id: "generate-transcript-pdf",
  description:
    "Compute the multi-term transcript for a student across all terms in an academic year, render to PDF preview. Emits data-generatePDF parts with kind: 'transcript'.",
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

    const republish = input.republish === true;
    const academicId = input.academicId ?? tenant.academicId;
    const previewTitle = sanitizeForFilename(input.fullName ?? "student");
    const provisionalArtifactId = `pdf-transcript-${input.studentId ?? input.admissionNo ?? 0}-${academicId ?? 0}`;
    const provisionalTitle = `${previewTitle}.pdf`;

    try {
      const rendered = await renderAndWriteTranscriptPdf({
        tenant,
        writer,
        input,
        republish,
      });
      return {
        artifactId: rendered.artifactId,
        kind: "pdf" as const,
        status: "success" as const,
        title: rendered.title,
        storagePath: rendered.storagePath,
        previewUrl: rendered.previewUrl,
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
