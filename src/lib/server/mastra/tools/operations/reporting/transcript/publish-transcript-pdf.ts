import { createTool, isValidationError } from "@mastra/core/tools";
import { z } from "zod";
import { render } from "svelte/server";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import { getDatabase } from "$lib/server/db";
import { smParents, smSchools, smStudents } from "$lib/server/db/sms-schema";
import { and, eq, like, or, type SQL } from "drizzle-orm";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { pageToHtml } from "$lib/server/helpers";
import type { StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import type { StudentDetails } from "$lib/server/repository/student.repo";
import ResultEmail from "$lib/components/template/result-email.svelte";
import { generateTranscriptPdfTool } from "./generate-transcript-pdf";

interface ReportPdfToolContext {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
    set?(key: string, value: unknown): void;
  };
  writer?: StreamWriterLike;
  abortSignal?: AbortSignal;
}

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
  thumbnailUrl: string;
  title: string;
  pdfBytes: Buffer;
};

type PdfArtifactData = {
  status: "processing" | "streaming" | "success" | "error";
  data?: string;
  title?: string;
  id?: string;
  storagePath?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  error?: string;
};

type SelectOptionItem = { id: string; label: string; icon?: string };

function getTenant(ctx: ReportPdfToolContext): TenantContext {
  const tenant = ctx.requestContext?.get("tenantContext") as TenantContext | undefined;
  if (!tenant) {
    throw new Error("TENANT_CONTEXT_REQUIRED: transcript-pdf tools require an active tenantContext");
  }
  return tenant;
}

function getWriter(ctx: ReportPdfToolContext): StreamWriterLike | undefined {
  return ctx.writer;
}

function getRequestContext(
  ctx: ReportPdfToolContext,
): NonNullable<ReportPdfToolContext["requestContext"]> {
  const rc = ctx.requestContext;
  if (!rc) {
    throw new Error("REQUEST_CONTEXT_REQUIRED: transcript-pdf tools require an active request context");
  }
  return rc;
}

async function resolveFilesystem(tenant: TenantContext): Promise<WorkspaceFilesystem> {
  const requestContext = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
  if (!fs) {
    throw new Error("WORKSPACE_UNAVAILABLE: tenant workspace filesystem is not configured");
  }
  return fs;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sanitizeForFilename(value: string | null | undefined): string {
  return (value || "student").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function generateConfirmationToken(): string {
  return base64url(
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
}

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

async function emitPdfPart(
  writer: StreamWriterLike | undefined,
  artifactId: string,
  payload: PdfArtifactData,
): Promise<void> {
  if (!writer) return;
  await writer.write({
    type: "data-generatePDF",
    id: artifactId,
    data: payload,
  } as never);
}

async function emitNotification(
  writer: StreamWriterLike | undefined,
  message: string,
  level: "info" | "warning" | "error" | "success",
): Promise<void> {
  if (!writer) return;
  await writer.write({
    type: "data-notification",
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    data: { message, level },
  } as never);
}

async function emitSelectOption(
  writer: StreamWriterLike | undefined,
  options: SelectOptionItem[],
  prompt: string,
  contextKey: string,
): Promise<void> {
  if (!writer) return;
  const gateId = `transcript-publish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writer.write({
    type: "data-selectOption",
    id: gateId,
    data: {
      options,
      promptText: prompt,
      runId: gateId,
      stepId: "publishTranscriptConfirm",
      contextKey,
    },
  } as never);
}

type StudentCriteria = {
  studentId?: number | null;
  admissionNo?: number | null;
  fullName?: string | null;
  partialName?: string | null;
  classId?: number | null;
  sectionId?: number | null;
};

async function resolveStudent(
  criteria: StudentCriteria,
  activeClassId: number | null,
  activeSectionId: number | null,
): Promise<StudentDetails> {
  const db = await getDatabase();
  const classId = criteria.classId ?? activeClassId;
  const sectionId = criteria.sectionId ?? activeSectionId;

  if (criteria.studentId !== undefined && criteria.studentId !== null) {
    const student = await db
      .select()
      .from(smStudents)
      .where(and(eq(smStudents.id, criteria.studentId), eq(smStudents.activeStatus, 1)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (!student) {
      throw new Error(
        `STUDENT_NOT_FOUND: no active student with id=${criteria.studentId}`,
      );
    }
    if (classId !== null && student.classId !== classId) {
      throw new Error(
        `WORKSPACE_MISMATCH: studentId=${criteria.studentId} is enrolled in classId=${student.classId ?? "?"}, not the active classId=${classId}`,
      );
    }
    if (sectionId !== null && student.sectionId !== sectionId) {
      throw new Error(
        `WORKSPACE_MISMATCH: studentId=${criteria.studentId} is enrolled in sectionId=${student.sectionId ?? "?"}, not the active sectionId=${sectionId}`,
      );
    }
    return mapRowToStudentDetails(student);
  }

  if (criteria.admissionNo !== undefined && criteria.admissionNo !== null) {
    const student = await db
      .select()
      .from(smStudents)
      .where(and(eq(smStudents.admissionNo, criteria.admissionNo), eq(smStudents.activeStatus, 1)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (!student) {
      throw new Error(
        `STUDENT_NOT_FOUND: no active student with admissionNo=${criteria.admissionNo}`,
      );
    }
    if (classId !== null && student.classId !== classId) {
      throw new Error(
        `WORKSPACE_MISMATCH: admissionNo=${criteria.admissionNo} belongs to classId=${student.classId ?? "?"}, not the active classId=${classId}`,
      );
    }
    if (sectionId !== null && student.sectionId !== sectionId) {
      throw new Error(
        `WORKSPACE_MISMATCH: admissionNo=${criteria.admissionNo} belongs to sectionId=${student.sectionId ?? "?"}, not the active sectionId=${sectionId}`,
      );
    }
    return mapRowToStudentDetails(student);
  }

  const conditions: Array<SQL<unknown> | undefined> = [eq(smStudents.activeStatus, 1)];
  const nameQuery = criteria.fullName ?? criteria.partialName;
  if (nameQuery) {
    const searchPattern = `%${nameQuery}%`;
    const nameCondition = or(
      like(smStudents.fullName, searchPattern),
      like(smStudents.firstName, searchPattern),
      like(smStudents.lastName, searchPattern),
    );
    if (nameCondition) {
      conditions.push(nameCondition);
    }
  }
  if (classId !== null) {
    conditions.push(eq(smStudents.classId, classId));
  }
  if (sectionId !== null) {
    conditions.push(eq(smStudents.sectionId, sectionId));
  }

  const candidates = await db
    .select()
    .from(smStudents)
    .where(and(...conditions))
    .limit(50);

  if (candidates.length === 0) {
    const label = criteria.fullName ?? criteria.partialName ?? "";
    throw new Error(
      `STUDENT_NOT_FOUND: no active student matching "${label}" in classId=${classId ?? "?"}/sectionId=${sectionId ?? "?"}`,
    );
  }

  const matches = criteria.fullName
    ? candidates.filter(
        (row) =>
          (row.fullName ?? "").trim().toLowerCase() ===
          criteria.fullName!.trim().toLowerCase(),
      )
    : candidates;

  if (matches.length === 0) {
    throw new Error(
      `STUDENT_AMBIGUOUS_NO_EXACT: ${candidates.length} candidate(s) match the partial query; none have the exact fullName "${criteria.fullName}"`,
    );
  }
  if (matches.length > 1) {
    const ids = matches.map((m) => m.id).join(", ");
    throw new Error(
      `STUDENT_AMBIGUOUS: ${matches.length} students share fullName "${criteria.fullName}": ids=[${ids}]. Provide studentId or admissionNo to disambiguate.`,
    );
  }

  return mapRowToStudentDetails(matches[0]);
}

function mapRowToStudentDetails(row: typeof smStudents.$inferSelect): StudentDetails {
  return {
    studentId: row.id,
    admissionNo: row.admissionNo,
    fullName: row.fullName,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    mobile: row.mobile,
    studentPhoto: row.studentPhoto,
    dateOfBirth: row.dateOfBirth,
    genderName: null,
    genderId: row.genderId,
    categoryName: null,
    studentCategoryId: row.studentCategoryId,
    parentId: row.parentId,
    guardiansName: null,
    guardiansMobile: null,
    guardiansEmail: null,
    classId: row.classId,
    sectionId: row.sectionId,
    className: null,
    sectionName: null,
    studentRecordId: null,
    schoolId: row.schoolId,
    academicId: row.academicId,
    rollNo: row.rollNo,
    userId: row.userId,
  };
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

type SchoolIdentity = {
  name: string;
  email: string;
  phone: string;
};

async function resolveSchoolIdentity(schoolId: number): Promise<SchoolIdentity> {
  const db = await getDatabase();
  const [row] = await db
    .select({
      name: smSchools.schoolName,
      email: smSchools.email,
      phone: smSchools.phone,
    })
    .from(smSchools)
    .where(eq(smSchools.id, schoolId))
    .limit(1);
  return {
    name: row?.name ?? "Your School",
    email: row?.email ?? "noreply@school.local",
    phone: row?.phone ?? "",
  };
}

function resolveSchoolLogoAbsolutePath(): string | null {
  const candidates = [
    path.join(process.cwd(), "static", "school-logo.png"),
    path.join(process.cwd(), "static", "logo.png"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

type SmtpSendResult = { success: boolean; message: string; messageId?: string };

async function sendTranscriptEmail(args: {
  schoolName: string;
  fromAddress: string;
  toAddress: string;
  parentName: string;
  studentName: string;
  academicId: number;
  pdfFilename: string;
  pdfBytes: Buffer;
  logoPath: string | null;
  html: string;
}): Promise<SmtpSendResult> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const secure = port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });

  const attachments: Array<{ filename: string; content: Buffer }> = [
    { filename: args.pdfFilename, content: args.pdfBytes },
  ];
  if (args.logoPath && fs.existsSync(args.logoPath)) {
    attachments.push({
      filename: "logo.png",
      content: fs.readFileSync(args.logoPath),
    });
  }

  const subject = `Academic Transcript — ${args.studentName} — Academic Year ${args.academicId}`;

  try {
    const info = await transporter.sendMail({
      from: `"${args.schoolName}" <${args.fromAddress}>`,
      to: args.toAddress,
      subject,
      text:
        `Dear ${args.parentName},\n\n` +
        `The academic transcript for ${args.studentName} (Academic Year ${args.academicId}) is attached.\n\n` +
        `Regards,\n${args.schoolName}`,
      html: args.html,
      attachments,
    });
    return { success: true, message: "Email sent successfully", messageId: info.messageId };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
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
  thumbnailUrl: string;
  pdfBytes: Buffer;
};

async function ensureTranscriptPdf(args: RenderArgs): Promise<RenderResult> {
  const { tenant, writer, input } = args;
  const academicId = input.academicId ?? tenant.academicId;
  if (academicId === null || academicId === undefined) {
    throw new Error("ACADEMIC_ID_REQUIRED: no academicId in input or active tenant");
  }

  const student = await resolveStudent(
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
  const storagePath = `exams/transcripts/ay-${academicId}/${student.studentId}.pdf`;
  const fsHandle = await resolveFilesystem(tenant);
  const pdfExists = await fsHandle.exists(storagePath);

  let previewUrl = "";
  let thumbnailUrl = "";
  let pdfBytes: Buffer = Buffer.alloc(0);

  if (!pdfExists || input.forceRegenerate) {
    await emitNotification(
      writer,
      input.forceRegenerate
        ? "Re-rendering transcript PDF (forceRegenerate=true)…"
        : "Transcript PDF not found; rendering now…",
      "info",
    );
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
          thumbnailUrl?: string;
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
    thumbnailUrl = innerResult.thumbnailUrl ?? "";
  } else {
    const token = base64url(
      JSON.stringify({ studentId: student.studentId, academicId, kind: "transcript" as const }),
    );
    previewUrl = `/api/results/${token}`;
    thumbnailUrl = "";
  }

  const readResult = await fsHandle.readFile(storagePath);
  pdfBytes = Buffer.isBuffer(readResult)
    ? readResult
    : Buffer.from(readResult, "binary");

  await emitPdfPart(writer, artifactId, {
    status: "success",
    data: previewUrl,
    title,
    id: artifactId,
    storagePath,
    previewUrl,
    thumbnailUrl,
  });

  return {
    artifactId,
    title,
    storagePath,
    previewUrl,
    thumbnailUrl,
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
  parentEmail: z.string().optional(),
  parentName: z.string().optional(),
  error: z.string().optional(),
});

export const publishTranscriptPdfTool = createTool({
  id: "publish-transcript-pdf",
  description:
    "Generate the transcript PDF (if missing), require ActionBar confirmation of the parent email address, then email the PDF via SMTP. NO smStudentTimelines row is written — email is the only delivery channel. On first call the tool emits a data-selectOption stream part with 'Send to <parentEmail>' and 'Cancel' and returns status='awaiting_confirmation'; on the second call pass confirmed=true with the matching confirmationToken to actually send.",
  inputSchema: reportPdfPublishInputSchema,
  outputSchema: reportPdfPublishOutputSchema,
  execute: async (input, ctx) => {
    const context = ctx as ReportPdfToolContext;
    const tenant = getTenant(context);
    const writer = getWriter(context);
    const requestContext = getRequestContext(context);

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
        await emitNotification(writer, "Transcript publish cancelled.", "warning");
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

      const schoolIdentity = await resolveSchoolIdentity(tenant.schoolId);
      const logoPath = resolveSchoolLogoAbsolutePath();
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

      const sendResult = await sendTranscriptEmail({
        schoolName: schoolIdentity.name,
        fromAddress: process.env.SMTP_FROM || schoolIdentity.email,
        toAddress: stored.parentEmail,
        parentName: stored.parentName,
        studentName: student.fullName ?? "Student",
        academicId,
        pdfFilename,
        pdfBytes: stored.pdfBytes,
        logoPath,
        html,
      });

      if (!sendResult.success) {
        await emitNotification(
          writer,
          `Transcript email failed: ${sendResult.message}`,
          "error",
        );
        await emitPdfPart(writer, stored.artifactId, {
          status: "error",
          data: "",
          title: stored.title,
          id: stored.artifactId,
          storagePath: stored.storagePath,
          previewUrl: stored.previewUrl,
          thumbnailUrl: stored.thumbnailUrl,
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
        `Transcript PDF sent to ${stored.parentEmail}`,
        "success",
      );
      await emitPdfPart(writer, stored.artifactId, {
        status: "success",
        data: stored.previewUrl,
        title: stored.title,
        id: stored.artifactId,
        storagePath: stored.storagePath,
        previewUrl: stored.previewUrl,
        thumbnailUrl: stored.thumbnailUrl,
      });

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
      await emitNotification(writer, "Transcript publish cancelled.", "warning");
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
      thumbnailUrl: rendered.thumbnailUrl,
      title: rendered.title,
      pdfBytes: rendered.pdfBytes,
    };
    requestContext.set?.(CONFIRM_CONTEXT_KEY, pendingState);

    await emitSelectOption(
      writer,
      [
        { id: `send:${parentEmail}`, label: `Send to ${parentEmail}`, icon: "mail" },
        { id: "cancel", label: "Cancel", icon: "x" },
      ],
      `Publish transcript for ${student.fullName ?? "student"} to ${parentEmail}?`,
      CONFIRM_CONTEXT_KEY,
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
