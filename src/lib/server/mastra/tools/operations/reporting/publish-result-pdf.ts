import { createTool, isValidationError } from "@mastra/core/tools";
import { z } from "zod";
import { getDatabase } from "$lib/server/db";
import { smStudents } from "$lib/server/db/sms-schema";
import { and, eq, like, or, type SQL } from "drizzle-orm";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createAssessmentPublisherServiceForRequest } from "$lib/server/service/assessment-publisher.service";
import type { StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import type { StudentDetails } from "$lib/server/repository/student.repo";
import { generateResultPdfTool } from "./generate-result-pdf";

interface ReportPdfToolContext {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
  };
  writer?: StreamWriterLike;
  abortSignal?: AbortSignal;
}

function getTenant(ctx: ReportPdfToolContext): TenantContext {
  const tenant = ctx.requestContext?.get("tenantContext") as TenantContext | undefined;
  if (!tenant) {
    throw new Error("TENANT_CONTEXT_REQUIRED: report-pdf tools require an active tenantContext");
  }
  return tenant;
}

function getWriter(ctx: ReportPdfToolContext): StreamWriterLike | undefined {
  return ctx.writer;
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
  level: "info" | "warning" | "error",
): Promise<void> {
  if (!writer) return;
  await writer.write({
    type: "data-notification",
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    data: { message, level },
  } as never);
}

const studentCriteriaBase = {
  schoolId: z.number().optional(),
  academicYear: z.string().optional(),
  examTypeId: z.number().optional(),
  classId: z.number().optional(),
  sectionId: z.number().optional(),
  studentId: z.number().optional(),
  admissionNo: z.number().optional(),
  fullName: z.string().optional(),
  partialName: z.string().optional(),
};

const reportPdfInputSchema = z.object({
  ...studentCriteriaBase,
  republish: z.boolean().optional(),
});

const reportPdfPublishInputSchema = z.object({
  ...studentCriteriaBase,
  forceRegenerate: z.boolean().optional(),
});

const reportPdfPublishOutputSchema = z.object({
  status: z.enum([
    "published",
    "regenerated_and_published",
    "skipped_already_published",
    "failed",
  ]),
  artifactId: z.string(),
  publicationUrl: z.string().optional(),
  messageId: z.string().optional(),
  timelineEntryId: z.number().optional(),
  error: z.string().optional(),
});

export const publishResultPdfTool = createTool({
  id: "publish-result-pdf",
  description:
    "Generate the PDF (if missing) and publish to parent email + write StudentTimeline row. One shimmer total via the republish flag.",
  inputSchema: reportPdfPublishInputSchema,
  outputSchema: reportPdfPublishOutputSchema,
  execute: async (input, ctx) => {
    const context = ctx as ReportPdfToolContext;
    const tenant = getTenant(context);
    const writer = getWriter(context);

    const examTypeId = input.examTypeId ?? tenant.examTypeId;
    if (examTypeId === null || examTypeId === undefined) {
      throw new Error("EXAM_TYPE_REQUIRED: no examTypeId in input or active tenant");
    }

    const assessment = await createAssessmentServiceForRequest(tenant);

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
    const artifactId = `pdf-${student.studentId}-${examTypeId}`;
    const storagePath = `exams/examType-${examTypeId}/pdfs/${student.studentId}.pdf`;
    const thumbnailPath = `exams/examType-${examTypeId}/pdfs/${student.studentId}.thumb.webp`;
    const fs = await resolveFilesystem(tenant);
    const pdfExists = await fs.exists(storagePath);

    let regenerated = false;
    let previewUrl = "";
    let thumbnailUrl = `/api/file/${thumbnailPath}`;

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
        return {
          status: "failed" as const,
          artifactId,
          error: innerResult.message || "PDF regeneration failed validation",
        };
      }
      if (innerResult.status !== "success") {
        const errMsg =
          typeof innerResult.error === "string"
            ? innerResult.error
            : "PDF regeneration failed";
        return {
          status: "failed" as const,
          artifactId,
          error: errMsg,
        };
      }
      regenerated = true;
      previewUrl = innerResult.previewUrl ?? "";
      thumbnailUrl = innerResult.thumbnailUrl ?? thumbnailUrl;
    } else {
      const token = base64url(
        JSON.stringify({ studentId: student.studentId, examTypeId }),
      );
      previewUrl = `/api/results/${token}`;
    }

    const alreadySent = await assessment.isEmailAlreadySent(student.studentId, examTypeId);
    if (alreadySent) {
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
        status: "skipped_already_published" as const,
        artifactId,
        publicationUrl: previewUrl,
      };
    }

    const publisher = await createAssessmentPublisherServiceForRequest(tenant);
    const publishResult = await publisher.publishResults({
      studentIds: [student.studentId],
      examId: examTypeId,
      resend: false,
    });

    if (!publishResult.success) {
      const message =
        publishResult.errors.length > 0
          ? publishResult.errors.join("; ")
          : "Publisher did not report success";
      await emitPdfPart(writer, artifactId, {
        status: "error",
        data: "",
        title,
        id: artifactId,
        storagePath,
        previewUrl,
        thumbnailUrl,
        error: message,
      });
      return {
        status: "failed" as const,
        artifactId,
        publicationUrl: previewUrl,
        error: message,
      };
    }

    const firstResult = publishResult.results[0];

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
      status: (regenerated ? "regenerated_and_published" : "published") as
        | "regenerated_and_published"
        | "published",
      artifactId,
      publicationUrl: previewUrl,
      messageId: firstResult?.messageId,
    };
  },
});