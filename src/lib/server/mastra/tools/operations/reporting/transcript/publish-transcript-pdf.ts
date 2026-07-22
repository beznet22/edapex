import { createTool, isValidationError } from "@mastra/core/tools";
import { z } from "zod";
import { render } from "svelte/server";
import { getDatabase } from "$lib/server/db";
import { smParents } from "$lib/server/db/sms-schema";
import { and, eq } from "drizzle-orm";
import { pageToHtml } from "$lib/server/helpers";
import { createAssessmentPublisherServiceForRequest } from "$lib/server/service/assessment-publisher.service";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import type { StudentDetails } from "$lib/server/repository/student.repo";
import ResultEmail from "$lib/components/template/result-email.svelte";
import { generateTranscriptPdfTool } from "./generate-transcript-pdf";
import {
  base64url,
  emitNotification,
  emitPdfPart,
  emitSelectOption,
  generateConfirmationToken,
  getRequestContext,
  getTenant,
  getWriter,
  resolveFilesystem,
  resolveStudent,
  sanitizeForFilename,
} from "$lib/server/mastra/tools/operations/reporting/_shared";
import { transcriptPdfPath, transcriptJsonPath, transcriptMarkdownPath } from "$lib/server/workspace/paths";
import { addEntry, readManifest as readWorkspaceManifest, updateEntry } from "$lib/server/workspace/manifest";
import { type MemoryContext } from "$lib/server/mastra/utils/chat-utils";

const CONFIRM_CONTEXT_KEY = "transcriptPublishConfirm";

type TranscriptConfirmState = {
  status: "pending" | "sent" | "cancelled";
  parentEmail: string;
  parentName: string;
  studentId: number;
  admissionNo: number | null;
  fullName: string;
  academicId: number;
  schoolId: number;
  artifactId: string;
  confirmationToken: string;
  storagePath: string;
  previewUrl: string;
  title: string;
  pdfBytes: Buffer;
};

function isConfirmState(value: unknown): value is TranscriptConfirmState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.studentId === "number" &&
    typeof v.academicId === "number" &&
    typeof v.parentEmail === "string" &&
    typeof v.confirmationToken === "string" &&
    typeof v.artifactId === "string" &&
    (v.status === "pending" || v.status === "sent" || v.status === "cancelled")
  );
}

type ParentLookup = {
  parentId: number;
  guardiansName: string | null;
  guardiansEmail: string | null;
};

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

type RenderArgs = {
  tenant: TenantContext;
  writer: StreamWriterLike | undefined;
  input: z.infer<typeof reportPdfPublishInputSchema>;
  ctx: unknown;
};

type RenderResult = {
  artifactId: string;
  title: string;
  storagePath: string;
  previewUrl: string;
  pdfBytes: Buffer;
};

async function ensureTranscriptPdf(args: RenderArgs): Promise<RenderResult> {
  const { tenant, writer, input } = args;
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
  const storagePath = transcriptPdfPath(student.studentId, tenant.examTypeId);
  const fsHandle = await resolveFilesystem(tenant);

  let previewUrl = "";
  let pdfBytes: Buffer = Buffer.alloc(0);

  await emitNotification(writer, undefined, "Rendering transcript PDF…", "info");
  const inner = generateTranscriptPdfTool.execute;
  if (typeof inner !== "function") {
    throw new Error("INNER_TOOL_UNAVAILABLE: generateTranscriptPdfTool.execute is not bound");
  }
  const generateInput = {
    schoolId: input.schoolId,
    academicId,
    classId: input.classId,
    sectionId: input.sectionId,
    studentId: student.studentId,
    admissionNo: undefined,
    fullName: undefined,
    partialName: undefined,
    republish: true,
  };
  type InnerOutput =
    | {
      artifactId: string;
      kind: "pdf";
      status: "success";
      title?: string;
      storagePath?: string;
      previewUrl?: string;
    }
    | {
      artifactId: string;
      kind: "pdf";
      status: "error";
      title?: string;
      error?: string;
    };
  type InnerInput = {
    schoolId?: number;
    academicId?: number;
    classId?: number;
    sectionId?: number;
    studentId?: number;
    admissionNo?: number;
    fullName?: string;
    partialName?: string;
    republish?: boolean;
  };
  const innerResultRaw: unknown = await (inner as (
    input: InnerInput,
    ctx: never,
  ) => Promise<unknown>)(generateInput, args.ctx as never);
  if (isValidationError(innerResultRaw)) {
    throw new Error(innerResultRaw.message || "Transcript PDF regeneration failed validation");
  }
  const innerResult = innerResultRaw as InnerOutput;
  if (innerResult.status !== "success") {
    const errMsg =
      typeof innerResult.error === "string"
        ? innerResult.error
        : "Transcript PDF regeneration failed";
    throw new Error(errMsg);
  }
  previewUrl = innerResult.previewUrl ?? "";

  const readResult = await fsHandle.readFile(storagePath);
  pdfBytes = Buffer.isBuffer(readResult)
    ? readResult
    : Buffer.from(readResult, "binary");

  await emitPdfPart(writer, undefined, artifactId, {
    status: "success",
    data: previewUrl,
    title,
    id: artifactId,
    storagePath,
    previewUrl,
  });

  return {
    artifactId,
    title,
    storagePath,
    previewUrl,
    pdfBytes,
  };
}

const reportPdfPublishInputSchema = z.object({
  schoolId: z.number().optional(),
  academicId: z.number().optional(),
  classId: z.number().optional(),
  sectionId: z.number().optional(),
  studentId: z.number().optional(),
  admissionNo: z.number().optional(),
  fullName: z.string().optional(),
  partialName: z.string().optional(),

  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  reason: z.string().describe("Human-readable action summary for user approval."),
});

const reportPdfPublishOutputSchema = z.object({
  status: z.enum([
    "published",
    "regenerated_and_published",
    "skipped_already_published",
    "failed",
    "awaiting_confirmation",
    "cancelled",
  ]),
  artifactId: z.string(),
  publicationUrl: z.string().optional(),
  messageId: z.string().optional(),
  parentEmail: z.string().optional(),
  parentName: z.string().optional(),
  error: z.string().optional(),
});

export const publishTranscriptPdfTool = createTool({
  id: "publish-transcript-pdf",
  description:
    "Generate the transcript PDF (if missing), require ActionBar confirmation of the parent email address, then email the PDF via SMTP. NO smStudentTimelines row is written — email is the only delivery channel. On first call the tool emits a data-selectOption stream part with 'Send to <parentEmail>' and 'Cancel' and returns status='awaiting_confirmation'; on the second call pass confirmed=true with the matching confirmationToken to actually send.",
  inputSchema: reportPdfPublishInputSchema,
  requireApproval: true,
  outputSchema: reportPdfPublishOutputSchema,
  execute: async (input, ctx) => {
    const context = ctx as Parameters<typeof getTenant>[0];
    const tenant = getTenant(context);
    const writer = getWriter(context);
    const requestContext = getRequestContext(context);

    const threadId = context.requestContext?.get('threadId') as string | undefined;
    const resourceId = context.requestContext?.get('resourceId') as string | undefined;
    const memCtx: MemoryContext | undefined = threadId && resourceId
      ? { threadId, resourceId }
      : undefined;

    const academicId = input.academicId ?? tenant.academicId;
    if (academicId === null || academicId === undefined) {
      throw new Error("ACADEMIC_ID_REQUIRED: no academicId in input or active tenant");
    }

    const existing = requestContext.get(CONFIRM_CONTEXT_KEY);

    if (input.confirmed === true) {
      const stored = isConfirmState(existing) ? existing : null;
      if (!stored) {
        throw new Error(
          "CONFIRM_STATE_MISSING: confirmed=true was passed but no pending transcriptPublishConfirm state exists. Invoke this tool without confirmed to begin a fresh publish.",
        );
      }
      if (stored.academicId !== academicId || stored.studentId !== (input.studentId ?? stored.studentId)) {
        throw new Error(
          `CONFIRM_STATE_MISMATCH: stored confirmation is for studentId=${stored.studentId}/academicId=${stored.academicId}, got studentId=${input.studentId ?? "?"}/academicId=${academicId}.`,
        );
      }
      if (input.confirmationToken !== undefined && input.confirmationToken !== stored.confirmationToken) {
        throw new Error(
          "CONFIRM_TOKEN_MISMATCH: confirmationToken does not match the stored state. Discard and start over.",
        );
      }
      if (stored.status === "cancelled") {
        await emitNotification(writer, memCtx, "Transcript publish cancelled.", "warning");
        return {
          status: "cancelled" as const,
          artifactId: stored.artifactId,
          parentEmail: stored.parentEmail,
          parentName: stored.parentName,
        };
      }
      if (stored.status === "sent") {
        await emitNotification(
          writer,
          memCtx,
          `Transcript already sent to ${stored.parentEmail}.`,
          "info",
        );
        return {
          status: "skipped_already_published" as const,
          artifactId: stored.artifactId,
          publicationUrl: stored.previewUrl,
          parentEmail: stored.parentEmail,
          parentName: stored.parentName,
        };
      }

      const student = await resolveStudent(
        tenant,
        {
          studentId: input.studentId ?? stored.studentId,
          admissionNo: input.admissionNo,
          fullName: input.fullName,
          partialName: input.partialName,
          classId: input.classId,
          sectionId: input.sectionId,
        },
        tenant.classId,
        tenant.sectionId,
      );

      const publisher = await createAssessmentPublisherServiceForRequest(tenant);
      const schoolIdentity = await publisher.resolveSchoolIdentity(tenant.schoolId);
      const pdfFilename = `${sanitizeForFilename(student.fullName ?? "student")}_transcript.pdf`;

      const emailProps = {
        schoolName: schoolIdentity.name,
        receiverName: stored.parentName,
        fullName: student.fullName ?? "Student",
        term: `Academic Year ${academicId}`,
        principal: "The Principal",
        contact: schoolIdentity.phone,
        support: schoolIdentity.email,
      };
      const { body, head } = render(ResultEmail, { props: emailProps });
      const html = pageToHtml(body, head);

      const sendResult = await publisher.publishTranscript({
        studentId: stored.studentId,
        academicId,
        parentName: stored.parentName,
        parentEmail: stored.parentEmail,
        studentName: student.fullName ?? "Student",
        pdfFilename,
        pdfBytes: stored.pdfBytes,
        html,
      });

      if (!sendResult.success) {
        await emitNotification(
          writer,
          memCtx,
          `Transcript email failed: ${sendResult.message}`,
          "error",
        );
        await emitPdfPart(writer, memCtx, stored.artifactId, {
          status: "error",
          data: "",
          title: stored.title,
          id: stored.artifactId,
          storagePath: stored.storagePath,
          previewUrl: stored.previewUrl,
          error: sendResult.message,
        });
        return {
          status: "failed" as const,
          artifactId: stored.artifactId,
          publicationUrl: stored.previewUrl,
          parentEmail: stored.parentEmail,
          parentName: stored.parentName,
          error: sendResult.message,
        };
      }

      const sentState: TranscriptConfirmState = {
        ...stored,
        status: "sent",
      };
      requestContext.set?.(CONFIRM_CONTEXT_KEY, sentState);

      await emitNotification(
        writer,
        memCtx,
        `Transcript PDF sent to ${stored.parentEmail}`,
        "success",
      );
      await emitPdfPart(writer, memCtx, stored.artifactId, {
        status: "success",
        data: stored.previewUrl,
        title: stored.title,
        id: stored.artifactId,
        storagePath: stored.storagePath,
        previewUrl: stored.previewUrl,
      });

      if (tenant.examTypeId != null) {
        const pubManifest = await readWorkspaceManifest(tenant, tenant.examTypeId);
        const pubSource = Object.values(pubManifest.entries).find(
          (e) => e.kind === 'user-file' && e.studentId === stored.studentId
        );
        if (pubSource) {
          await updateEntry(tenant, pubSource.path, { status: 'Published' }, tenant.examTypeId);
        }
        const tJsonPath = transcriptJsonPath(stored.studentId, tenant.examTypeId);
        const tMdPath = transcriptMarkdownPath(stored.studentId, tenant.examTypeId);
        await updateEntry(tenant, tJsonPath, { status: 'Published' }, tenant.examTypeId).catch(() => {});
        await updateEntry(tenant, tMdPath, { status: 'Published' }, tenant.examTypeId).catch(() => {});
        await updateEntry(tenant, stored.storagePath, { status: 'Published' }, tenant.examTypeId).catch(() => {});
      }

      return {
        status: "published" as const,
        artifactId: stored.artifactId,
        publicationUrl: stored.previewUrl,
        messageId: sendResult.messageId,
        parentEmail: stored.parentEmail,
        parentName: stored.parentName,
      };
    }

    if (input.confirmed === false) {
      const stored = isConfirmState(existing) ? existing : null;
      const targetArtifactId = stored?.artifactId ?? `pdf-transcript-pending-${Date.now()}`;
      requestContext.set?.(CONFIRM_CONTEXT_KEY, {
        ...(stored ?? {}),
        status: "cancelled",
        artifactId: targetArtifactId,
      } as TranscriptConfirmState);
      await emitNotification(writer, memCtx, "Transcript publish cancelled.", "warning");
      return {
        status: "cancelled" as const,
        artifactId: targetArtifactId,
        parentEmail: stored?.parentEmail,
        parentName: stored?.parentName,
      };
    }

    const rendered = await ensureTranscriptPdf({
      tenant,
      writer,
      input,
      ctx,
    });

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

    const parent = await resolveParentForStudent(student);
    const parentEmail = parent?.guardiansEmail ?? null;
    if (!parentEmail) {
      await emitNotification(
        writer,
        memCtx,
        `Cannot publish transcript for ${student.fullName ?? "student"}: no parent email on file.`,
        "error",
      );
      return {
        status: "failed" as const,
        artifactId: rendered.artifactId,
        publicationUrl: rendered.previewUrl,
        error: "PARENT_EMAIL_MISSING: student has no linked parent with an email address",
      };
    }
    const parentName = parent?.guardiansName ?? "Parent/Guardian";

    const confirmationToken = generateConfirmationToken();
    const pendingState: TranscriptConfirmState = {
      status: "pending",
      parentEmail,
      parentName,
      studentId: student.studentId,
      admissionNo: student.admissionNo,
      fullName: student.fullName ?? "",
      academicId,
      schoolId: tenant.schoolId,
      artifactId: rendered.artifactId,
      confirmationToken,
      storagePath: rendered.storagePath,
      previewUrl: rendered.previewUrl,
      title: rendered.title,
      pdfBytes: rendered.pdfBytes,
    };
    requestContext.set?.(CONFIRM_CONTEXT_KEY, pendingState);

    await emitSelectOption(
      writer,
      memCtx,
      [
        { id: `send:${parentEmail}`, label: `Send to ${parentEmail}`, icon: "mail" },
        { id: "cancel", label: "Cancel", icon: "x" },
      ],
      `Publish transcript for ${student.fullName ?? "student"} to ${parentEmail}?`,
      CONFIRM_CONTEXT_KEY,
      "publishTranscriptConfirm",
    );

    return {
      status: "awaiting_confirmation" as const,
      artifactId: rendered.artifactId,
      publicationUrl: rendered.previewUrl,
      parentEmail,
      parentName,
    };
  },
});
