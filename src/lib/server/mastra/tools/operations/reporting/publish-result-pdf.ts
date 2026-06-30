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
  buildResultStoragePath,
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
  studentCriteriaBase,
} from "./_shared";

const CONFIRM_CONTEXT_KEY = "resultPublishConfirm";

type ResultConfirmState = {
  status: "pending" | "sent" | "cancelled";
  parentEmail: string;
  parentName: string;
  studentId: number;
  admissionNo: number | null;
  fullName: string;
  examTypeId: number;
  schoolId: number;
  artifactId: string;
  confirmationToken: string;
  storagePath: string;
  previewUrl: string;
  title: string;
};

function isConfirmState(value: unknown): value is ResultConfirmState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.studentId === "number" &&
    typeof v.examTypeId === "number" &&
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

const reportPdfInputSchema = z.object({
  ...studentCriteriaBase,
  republish: z.boolean().optional(),
});

const reportPdfPublishInputSchema = z.object({
  ...studentCriteriaBase,
  forceRegenerate: z.boolean().optional(),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
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
  timelineEntryId: z.number().optional(),
  parentEmail: z.string().optional(),
  parentName: z.string().optional(),
  error: z.string().optional(),
});

type RenderPreview = {
  artifactId: string;
  title: string;
  storagePath: string;
  previewUrl: string;
  regenerated: boolean;
};

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
): Promise<RenderPreview> {
  const fs = await resolveFilesystem(tenant);
  const pdfExists = await fs.exists(storagePath);

  let regenerated = false;
  let previewUrl = "";

  if (!pdfExists || input.forceRegenerate) {
    await emitNotification(
      writer,
      input.forceRegenerate
        ? "Re-rendering PDF (forceRegenerate=true)…"
        : "PDF not found; rendering now…",
      "info",
    );
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
      republish: true,
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
    regenerated = true;
    previewUrl = innerResult.previewUrl ?? "";
  } else {
    const token = base64url(
      JSON.stringify({ studentId: student.studentId, examTypeId }),
    );
    previewUrl = `/api/results/${token}`;
  }

  return { artifactId, title, storagePath, previewUrl, regenerated };
}

export const publishResultPdfTool = createTool({
  id: "publish-result-pdf",
  description:
    "Generate the PDF (if missing), require ActionBar confirmation of the parent email address, then publish to parent email + write StudentTimeline row. On first call emits data-selectOption with 'Send to <parentEmail>' / 'Cancel' and returns status='awaiting_confirmation'; on the second call pass confirmed=true with the matching confirmationToken to actually publish.",
  inputSchema: reportPdfPublishInputSchema,
  outputSchema: reportPdfPublishOutputSchema,
  execute: async (input, ctx) => {
    const context = ctx as Parameters<typeof getTenant>[0];
    const tenant = getTenant(context);
    const writer = getWriter(context);
    const requestContext = getRequestContext(context);

    const examTypeId = input.examTypeId ?? tenant.examTypeId;
    if (examTypeId === null || examTypeId === undefined) {
      throw new Error("EXAM_TYPE_REQUIRED: no examTypeId in input or active tenant");
    }

    const existing = requestContext.get(CONFIRM_CONTEXT_KEY);

    if (input.confirmed === true) {
      const stored = isConfirmState(existing) ? existing : null;
      if (!stored) {
        throw new Error(
          "CONFIRM_STATE_MISSING: confirmed=true was passed but no pending resultPublishConfirm state exists. Invoke this tool without confirmed to begin a fresh publish.",
        );
      }
      if (
        stored.examTypeId !== examTypeId ||
        stored.studentId !== (input.studentId ?? stored.studentId)
      ) {
        throw new Error(
          `CONFIRM_STATE_MISMATCH: stored confirmation is for studentId=${stored.studentId}/examTypeId=${stored.examTypeId}, got studentId=${input.studentId ?? "?"}/examTypeId=${examTypeId}.`,
        );
      }
      if (
        input.confirmationToken !== undefined &&
        input.confirmationToken !== stored.confirmationToken
      ) {
        throw new Error(
          "CONFIRM_TOKEN_MISMATCH: confirmationToken does not match the stored state. Discard and start over.",
        );
      }

      if (stored.status === "cancelled") {
        await emitNotification(writer, "Result publish cancelled.", "warning");
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
          `Result already published to ${stored.parentEmail}.`,
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

      const assessment = await createAssessmentServiceForRequest(tenant);
      const alreadySent = await assessment.isEmailAlreadySent(stored.studentId, examTypeId);
      if (alreadySent) {
        await emitPdfPart(writer, stored.artifactId, {
          status: "success",
          data: stored.previewUrl,
          title: stored.title,
          id: stored.artifactId,
          storagePath: stored.storagePath,
          previewUrl: stored.previewUrl,
        });
        return {
          status: "skipped_already_published" as const,
          artifactId: stored.artifactId,
          publicationUrl: stored.previewUrl,
          parentEmail: stored.parentEmail,
          parentName: stored.parentName,
        };
      }

      const publisher = await createAssessmentPublisherServiceForRequest(tenant);
      const publishResult = await publisher.publishResults({
        studentIds: [stored.studentId],
        examId: examTypeId,
        resend: false,
      });

      if (!publishResult.success) {
        const message =
          publishResult.errors.length > 0
            ? publishResult.errors.join("; ")
            : "Publisher did not report success";
        await emitNotification(writer, `Result publish failed: ${message}`, "error");
        await emitPdfPart(writer, stored.artifactId, {
          status: "error",
          data: "",
          title: stored.title,
          id: stored.artifactId,
          storagePath: stored.storagePath,
          previewUrl: stored.previewUrl,
          error: message,
        });
        return {
          status: "failed" as const,
          artifactId: stored.artifactId,
          publicationUrl: stored.previewUrl,
          parentEmail: stored.parentEmail,
          parentName: stored.parentName,
          error: message,
        };
      }

      const firstResult = publishResult.results[0];
      requestContext.set?.(CONFIRM_CONTEXT_KEY, { ...stored, status: "sent" });
      await emitNotification(
        writer,
        `Result PDF sent to ${stored.parentEmail}`,
        "success",
      );
      await emitPdfPart(writer, stored.artifactId, {
        status: "success",
        data: stored.previewUrl,
        title: stored.title,
        id: stored.artifactId,
        storagePath: stored.storagePath,
        previewUrl: stored.previewUrl,
      });

      return {
        status: "published" as const,
        artifactId: stored.artifactId,
        publicationUrl: stored.previewUrl,
        messageId: firstResult?.messageId,
        parentEmail: stored.parentEmail,
        parentName: stored.parentName,
      };
    }

    if (input.confirmed === false) {
      const stored = isConfirmState(existing) ? existing : null;
      const targetArtifactId = stored?.artifactId ?? `pdf-result-pending-${Date.now()}`;
      requestContext.set?.(CONFIRM_CONTEXT_KEY, {
        ...(stored ?? {}),
        status: "cancelled",
        artifactId: targetArtifactId,
      } as ResultConfirmState);
      await emitNotification(writer, "Result publish cancelled.", "warning");
      return {
        status: "cancelled" as const,
        artifactId: targetArtifactId,
        parentEmail: stored?.parentEmail,
        parentName: stored?.parentName,
      };
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
    const storagePath = buildResultStoragePath(examTypeId, student.admissionNo, student.fullName);

    const preview = await ensureResultPdf(tenant, writer, input, student, examTypeId, artifactId, title, storagePath, ctx);

    const parent = await resolveParentForStudent(student);
    const parentEmail = parent?.guardiansEmail ?? null;
    if (!parentEmail) {
      await emitNotification(
        writer,
        `Cannot publish result for ${student.fullName ?? "student"}: no parent email on file.`,
        "error",
      );
      return {
        status: "failed" as const,
        artifactId: preview.artifactId,
        publicationUrl: preview.previewUrl,
        error: "PARENT_EMAIL_MISSING: student has no linked parent with an email address",
      };
    }
    const parentName = parent?.guardiansName ?? "Parent/Guardian";

    const confirmationToken = generateConfirmationToken();
    const pendingState: ResultConfirmState = {
      status: "pending",
      parentEmail,
      parentName,
      studentId: student.studentId,
      admissionNo: student.admissionNo,
      fullName: student.fullName ?? "",
      examTypeId,
      schoolId: tenant.schoolId,
      artifactId: preview.artifactId,
      confirmationToken,
      storagePath: preview.storagePath,
      previewUrl: preview.previewUrl,
      title: preview.title,
    };
    requestContext.set?.(CONFIRM_CONTEXT_KEY, pendingState);

    await emitSelectOption(
      writer,
      [
        { id: `send:${parentEmail}`, label: `Send to ${parentEmail}`, icon: "mail" },
        { id: "cancel", label: "Cancel", icon: "x" },
      ],
      `Publish result for ${student.fullName ?? "student"} to ${parentEmail}?`,
      CONFIRM_CONTEXT_KEY,
      "publishResultConfirm",
    );

    return {
      status: "awaiting_confirmation" as const,
      artifactId: preview.artifactId,
      publicationUrl: preview.previewUrl,
      parentEmail,
      parentName,
    };
  },
});
