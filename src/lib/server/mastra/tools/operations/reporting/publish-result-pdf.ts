import { createTool, isValidationError } from "@mastra/core/tools";
import { z } from "zod";
import { getDatabase } from "$lib/server/db";
import { smParents } from "$lib/server/db/sms-schema";
import { and, eq } from "drizzle-orm";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createAssessmentPublisherServiceForRequest } from "$lib/server/service/assessment-publisher.service";
import type { StudentDetails } from "$lib/server/repository/student.repo";
import type { StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import { generateResultPdfTool } from "./generate-result-pdf";
import {
  base64url,
  emitNotification,
  getTenant,
  getWriter,
  resolveFilesystem,
  resolveStudent,
  sanitizeForFilename,
  studentCriteriaBase,
} from "$lib/server/mastra/tools/operations/reporting/_shared";
import { marksheetPdfPath, marksheetJsonPath, marksheetMarkdownPath } from "$lib/server/workspace/paths";
import { updateEntryStatus, updateEntry, readManifest as readWorkspaceManifest } from "$lib/server/workspace/manifest";
import type { MemoryContext } from "$lib/server/mastra/utils/chat-utils";

interface ParentLookup {
  parentId: number;
  guardiansName: string | null;
  guardiansEmail: string | null;
}

async function resolveParentForStudent(student: StudentDetails): Promise<ParentLookup | null> {
  const db = await getDatabase();
  if (student.parentId === null || student.parentId === undefined) return null;
  const [row] = await db
    .select({
      parentId: smParents.id,
      guardiansName: smParents.guardiansName,
      guardiansEmail: smParents.guardiansEmail,
    })
    .from(smParents)
    .where(and(eq(smParents.id, student.parentId), eq(smParents.activeStatus, 1)))
    .limit(1);
  return row ?? null;
}

const reportPdfInputSchema = z.object({
  ...studentCriteriaBase,
});

const reportPdfPublishInputSchema = z.object({
  ...studentCriteriaBase,
  resend: z.boolean().optional().describe('Skip the already-sent check and resend the email.'),
});

const reportPdfPublishOutputSchema = z.object({
  status: z.enum([
    "published",
    "skipped_already_published",
    "failed",
  ]),
  artifactId: z.string(),
  publicationUrl: z.string().optional(),
  messageId: z.string().optional(),
  parentEmail: z.string().optional(),
  parentName: z.string().optional(),
  error: z.string().optional(),
});

async function ensureResultPdf(
  tenant: import("$lib/server/mastra/tenant-context").TenantContext,
  writer: import("$lib/server/mastra/agent-stream-retry").StreamWriterLike | undefined,
  input: z.infer<typeof reportPdfPublishInputSchema>,
  student: StudentDetails,
  examTypeId: number,
  artifactId: string,
  title: string,
  storagePath: string,
  ctx: unknown,
): Promise<{ artifactId: string; title: string; storagePath: string; previewUrl: string; regenerated: boolean }> {
  await emitNotification(writer, undefined, "Rendering PDF…", "info");
  const generateInput = {
    schoolId: input.schoolId,
    academicYear: input.academicYear,
    examTypeId,
    classId: input.classId,
    sectionId: input.sectionId,
    studentId: student.studentId,
    admissionNo: undefined,
    fullName: undefined,
    partialName: undefined,
  } satisfies z.infer<typeof reportPdfInputSchema>;
  const inner = generateResultPdfTool.execute;
  if (typeof inner !== "function") {
    throw new Error("INNER_TOOL_UNAVAILABLE: generateResultPdfTool.execute is not bound");
  }
  const innerResult = await inner(generateInput, ctx as never);
  if (isValidationError(innerResult)) {
    throw new Error(innerResult.message || "PDF regeneration failed validation");
  }
  if (innerResult.status !== "success") {
    const errMsg =
      typeof innerResult.error === "string"
        ? innerResult.error
        : "PDF regeneration failed";
    throw new Error(errMsg);
  }
  const previewUrl = innerResult.previewUrl ?? "";

  return { artifactId, title, storagePath, previewUrl, regenerated: true };
}

export const publishResultPdfTool = createTool({
  id: "publish-result-pdf",
  description:
    "Generate the PDF (if missing), then publish it to the parent via email + write a StudentTimeline row. Requires user approval (HITL).",
  inputSchema: reportPdfPublishInputSchema,
  requireApproval: true,
  outputSchema: reportPdfPublishOutputSchema,
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

    const fullName = student.fullName ?? "student";
    const title = `${sanitizeForFilename(fullName)}.pdf`;
    const artifactId = `pdf-${student.studentId}-${examTypeId}`;
    const storagePath = marksheetPdfPath(student.studentId, student.admissionNo, student.fullName, examTypeId);

    const preview = await ensureResultPdf(tenant, writer, input, student, examTypeId, artifactId, title, storagePath, ctx);

    const parent = await resolveParentForStudent(student);
    const parentEmail = parent?.guardiansEmail ?? null;
    const parentName = parent?.guardiansName ?? null;

    if (!parentEmail) {
      await emitNotification(
        writer,
        memCtx,
        `Cannot publish result for ${student.fullName ?? "student"}: no parent email on file.`,
        "error",
      );
      return {
        status: "failed" as const,
        artifactId: preview.artifactId,
        publicationUrl: preview.previewUrl,
        parentEmail: undefined,
        parentName: parentName ?? undefined,
        error: "PARENT_EMAIL_MISSING: student has no linked parent with an email address",
      };
    }

    const publisher = await createAssessmentPublisherServiceForRequest(tenant);
    const publishResult = await publisher.publishResults({
      studentIds: [student.studentId],
      examId: examTypeId,
      resend: input.resend ?? false,
    });

    if (!publishResult.success) {
      const message =
        publishResult.errors.length > 0
          ? publishResult.errors.join("; ")
          : "Publisher did not report success";
      await emitNotification(writer, memCtx, `Result publish failed: ${message}`, "error");
      return {
        status: "failed" as const,
        artifactId: preview.artifactId,
        publicationUrl: preview.previewUrl,
        parentEmail,
        parentName: parentName ?? undefined,
        error: message,
      };
    }

    const firstResult = publishResult.results[0];
    const jsonPath = marksheetJsonPath(student.studentId, examTypeId);
    await updateEntryStatus(tenant, jsonPath, 'published', examTypeId);
    const mdPath = marksheetMarkdownPath({ studentId: student.studentId, examTypeId });
    await updateEntry(tenant, jsonPath, { status: 'Published' }, examTypeId);
    await updateEntry(tenant, mdPath, { status: 'Published' }, examTypeId);
    await updateEntry(tenant, storagePath, { status: 'Published' }, examTypeId);

    await emitNotification(
      writer,
      memCtx,
      `Result PDF sent to ${parentEmail}`,
      "success",
    );

    return {
      status: "published" as const,
      artifactId: preview.artifactId,
      publicationUrl: preview.previewUrl,
      messageId: firstResult?.messageId,
      parentEmail,
      parentName: parentName ?? undefined,
    };
  },
});
