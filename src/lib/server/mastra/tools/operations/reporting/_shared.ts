/**
 * Shared helpers for the reporting tool family (generate-result-pdf,
 * generate-transcript-pdf, publish-result-pdf, publish-transcript-pdf).
 *
 * Extracted from the four tool files which had drifted copies of the same
 * utilities. New helpers added here must use the canonical signatures and
 * keep error messages stable — the tool layer surfaces these strings to the
 * UI via `data-notification` parts.
 */
import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "$lib/server/db";
import { smAcademicYears, smStudents, studentRecords } from "$lib/server/db/sms-schema";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import type { StudentDetails } from "$lib/server/repository/student.repo";

export interface ReportPdfToolContext {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
    set?(key: string, value: unknown): void;
  };
  writer?: StreamWriterLike;
  abortSignal?: AbortSignal;
}

export function getTenant(ctx: ReportPdfToolContext): TenantContext {
  const tenant = ctx.requestContext?.get("tenantContext") as TenantContext | undefined;
  if (!tenant) {
    throw new Error("TENANT_CONTEXT_REQUIRED: report-pdf tools require an active tenantContext");
  }
  return tenant;
}

export function getWriter(ctx: ReportPdfToolContext): StreamWriterLike | undefined {
  return ctx.writer;
}

export function getRequestContext(
  ctx: ReportPdfToolContext,
): NonNullable<ReportPdfToolContext["requestContext"]> {
  const rc = ctx.requestContext;
  if (!rc) {
    throw new Error("REQUEST_CONTEXT_REQUIRED: report-pdf tools require an active request context");
  }
  return rc;
}

export async function resolveFilesystem(tenant: TenantContext): Promise<WorkspaceFilesystem> {
  const requestContext = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
  if (!fs) {
    throw new Error("WORKSPACE_UNAVAILABLE: tenant workspace filesystem is not configured");
  }
  return fs;
}

export function base64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function generateConfirmationToken(): string {
  return base64url(`${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
}

export function sanitizeForFilename(value: string | null | undefined): string {
  return (value || "student").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

export type StudentCriteria = {
  studentId?: number | null;
  admissionNo?: number | null;
  fullName?: string | null;
  partialName?: string | null;
  classId?: number | null;
  sectionId?: number | null;
};

export async function resolveStudent(
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

export function mapRowToStudentDetails(row: typeof smStudents.$inferSelect): StudentDetails {
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

export type PdfArtifactData = {
  status: "processing" | "streaming" | "success" | "error";
  data?: string;
  title?: string;
  id?: string;
  storagePath?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  error?: string;
};

export type SelectOptionItem = { id: string; label: string; icon?: string };

export async function emitPdfPart(
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

export async function emitNotification(
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

export async function emitSelectOption(
  writer: StreamWriterLike | undefined,
  options: SelectOptionItem[],
  prompt: string,
  contextKey: string,
  stepId = "publishPdfConfirm",
): Promise<void> {
  if (!writer) return;
  const gateId = `${stepId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writer.write({
    type: "data-selectOption",
    id: gateId,
    data: {
      options,
      promptText: prompt,
      runId: gateId,
      stepId,
      contextKey,
    },
  } as never);
}

export function buildResultStoragePath(
  examTypeId: number,
  admissionNo: number | null,
  fullName: string | null,
): string {
  return `exams/examType-${examTypeId}/pdfs/${admissionNo ?? 0}_${sanitizeForFilename(fullName)}.pdf`;
}

export function buildTranscriptStoragePath(
  academicId: number,
  admissionNo: number | null,
  fullName: string | null,
): string {
  return `exams/transcripts/ay-${academicId}/${admissionNo ?? 0}_${sanitizeForFilename(fullName)}.pdf`;
}

export type StudentSession = {
  classId: number | null;
  sectionId: number | null;
  schoolId: number | null;
  academicId: number | null;
};

/**
 * Resolves the student's CURRENT academic session assignment by querying
 * `student_records` (the per-academic-year tracker at sms-schema.ts:9001).
 * `sm_students.classId/sectionId` may be stale after promotions — `student_records`
 * is the authoritative source for the current session.
 *
 * Returns null if no active record is found for the given studentId + academicId.
 */
export async function _resolveStudentSession(
  studentId: number,
  preferredAcademicId: number | null,
): Promise<StudentSession | null> {
  const db = await getDatabase();

  let academicId: number | null = preferredAcademicId ?? null;
  if (academicId === null) {
    // smAcademicYears has no explicit "current year" marker column.
    // Fall back to the most recently created academic year.
    const [current] = await db
      .select({ id: smAcademicYears.id })
      .from(smAcademicYears)
      .orderBy(desc(smAcademicYears.id))
      .limit(1);
    academicId = current?.id ?? null;
  }
  if (academicId === null) return null;

  const [row] = await db
    .select({
      classId: studentRecords.classId,
      sectionId: studentRecords.sectionId,
      schoolId: studentRecords.schoolId,
      academicId: studentRecords.academicId,
    })
    .from(studentRecords)
    .where(
      and(
        eq(studentRecords.studentId, studentId),
        eq(studentRecords.academicId, academicId),
        eq(studentRecords.activeStatus, 1),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    classId: row.classId ?? null,
    sectionId: row.sectionId ?? null,
    schoolId: row.schoolId ?? null,
    academicId: row.academicId ?? null,
  };
}

export const studentCriteriaBase = {
  schoolId: z.number().optional(),
  academicYear: z.string().optional(),
  examTypeId: z.number().optional(),
  academicId: z.number().optional(),
  classId: z.number().optional(),
  sectionId: z.number().optional(),
  studentId: z.number().optional(),
  admissionNo: z.number().optional(),
  fullName: z.string().optional(),
  partialName: z.string().optional(),
};
