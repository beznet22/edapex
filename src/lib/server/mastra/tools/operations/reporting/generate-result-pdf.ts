import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getDatabase } from "$lib/server/db";
import { smExamTypes, smResultStores, smStudents } from "$lib/server/db/sms-schema";
import { and, eq, like, or, type SQL } from "drizzle-orm";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { generate as generatePdf } from "$lib/server/helpers/pdf-generator";
import type { StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import { resolveExamTypeId, type TenantContext } from "$lib/server/mastra/tenant-context";
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import type { StudentDetails } from "$lib/server/repository/student.repo";

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

async function loadExamTypeTitle(examTypeId: number): Promise<string | null> {
  const db = await getDatabase();
  const [row] = await db
    .select({ title: smExamTypes.title })
    .from(smExamTypes)
    .where(eq(smExamTypes.id, examTypeId))
    .limit(1);
  return row?.title ?? null;
}

async function loadTotalMarksSummary(
  studentId: number,
  examTypeId: number,
): Promise<{ totalMarks: number | null; subjects: number; examTypeTitle: string | null }> {
  const db = await getDatabase();
  const [aggregate, examType] = await Promise.all([
    db
      .select({
        totalMarks: smResultStores.totalMarks,
        subjectId: smResultStores.subjectId,
      })
      .from(smResultStores)
      .where(
        and(
          eq(smResultStores.studentId, studentId),
          eq(smResultStores.examTypeId, examTypeId),
          eq(smResultStores.activeStatus, 1),
        ),
      ),
    loadExamTypeTitle(examTypeId),
  ]);
  const total = aggregate.reduce(
    (sum, row) => sum + (row.totalMarks !== null ? Number(row.totalMarks) : 0),
    0,
  );
  const subjectIds = new Set<number>();
  for (const row of aggregate) {
    if (row.subjectId !== null) subjectIds.add(row.subjectId);
  }
  return {
    totalMarks: aggregate.length > 0 ? total : null,
    subjects: subjectIds.size,
    examTypeTitle: examType,
  };
}

type PdfRenderInput = {
  student: StudentDetails;
  examTypeTitle: string | null;
  examTypeId: number;
  totalMarks: number | null;
  subjects: number;
  resultDataStatus: "ok" | "empty";
  fileBase: string;
};

async function renderMinimalPdf(input: PdfRenderInput): Promise<Buffer> {
  const fullName = input.student.fullName ?? "Student";
  const classLine = [input.student.className, input.student.sectionName]
    .filter(Boolean)
    .join(" / ") || `${input.student.classId ?? "?"}/${input.student.sectionId ?? "?"}`;
  const totalLine =
    input.totalMarks !== null
      ? `<p><strong>Total Marks:</strong> ${input.totalMarks.toFixed(2)} across ${input.subjects} subject(s)</p>`
      : `<p><strong>Result:</strong> No marks recorded for this exam yet.</p>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${fullName} — ${input.examTypeTitle ?? "Exam"}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; padding: 24px; color: #1f2937; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  h2 { font-size: 14px; color: #6b7280; font-weight: 500; margin: 0 0 16px 0; }
  .meta { border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 12px 0; margin: 12px 0; }
  .meta p { margin: 4px 0; font-size: 13px; }
  p { font-size: 13px; }
  small { color: #6b7280; font-size: 11px; }
</style>
</head>
<body>
  <h1>${fullName}</h1>
  <h2>${input.examTypeTitle ?? `Exam Type #${input.examTypeId}`}</h2>
  <div class="meta">
    <p><strong>Admission No:</strong> ${input.student.admissionNo ?? "—"}</p>
    <p><strong>Class / Section:</strong> ${classLine}</p>
    <p><strong>Roll No:</strong> ${input.student.rollNo ?? "—"}</p>
    ${totalLine}
  </div>
  <p><small>Generated by EdApex Assistant on ${new Date().toISOString()}.</small></p>
  ${
    input.resultDataStatus === "empty"
      ? `<p><small>Full marksheet template will replace this placeholder once the ResultTemplate renderer is wired into the tool context.</small></p>`
      : ""
  }
</body>
</html>`;

  const generated = await generatePdf({
    htmlContent: html,
    fileName: input.fileBase,
  });
  if (!generated.success || !generated.pdfBuffer) {
    throw new Error(
      `PDF_RENDER_FAILED: ${generated.error ?? "unknown html2pdf error"}`,
    );
  }
  return generated.pdfBuffer;
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

const reportPdfOutputSchema = z.object({
  artifactId: z.string(),
  kind: z.literal("pdf"),
  status: z.enum(["success", "error"]),
  title: z.string().optional(),
  storagePath: z.string().optional(),
  previewUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
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
  thumbnailUrl: string;
  pdfExists: boolean;
  error?: string;
};

const PLACEHOLDER_THUMBNAIL_WEBP: Uint8Array = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0x08,
]);

async function renderAndWriteResultPdf(args: CoreRenderArgs): Promise<CoreRenderResult> {
  const { tenant, writer, input, republish } = args;

  const examTypeId = input.examTypeId ?? tenant.examTypeId;
  if (examTypeId === null || examTypeId === undefined) {
    throw new Error("EXAM_TYPE_REQUIRED: no examTypeId in input or active tenant");
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
  const artifactId = `pdf-${student.studentId}-${examTypeId}`;
  const storagePath = `exams/examType-${examTypeId}/pdfs/${student.studentId}.pdf`;
  const thumbnailPath = `exams/examType-${examTypeId}/pdfs/${student.studentId}.thumb.webp`;

  const fs = await resolveFilesystem(tenant);
  const pdfExists = await fs.exists(storagePath);

  if (!republish) {
    await emitPdfPart(writer, artifactId, {
      status: "processing",
      data: "",
      title,
      id: artifactId,
      storagePath,
    });
  }

  if (pdfExists && !input.republish) {
    const token = base64url(JSON.stringify({ studentId: student.studentId, examTypeId }));
    const previewUrl = `/api/results/${token}`;
    const thumbnailUrl = `/api/file/${thumbnailPath}`;
    if (!republish) {
      await emitPdfPart(writer, artifactId, {
        status: "success",
        data: previewUrl,
        title,
        id: artifactId,
        storagePath,
        previewUrl,
        thumbnailUrl,
      });
    }
    return {
      ok: true,
      artifactId,
      title,
      storagePath,
      previewUrl,
      thumbnailUrl,
      pdfExists: true,
    };
  }

  const assessment = await createAssessmentServiceForRequest(tenant);
  const fullResult = await assessment.getStudentResult({
    id: student.studentId,
    examId: examTypeId,
    isAdminNo: false,
    withImages: false,
  });

  const summary = await loadTotalMarksSummary(student.studentId, examTypeId);
  const fileBase = `res_${sanitizeForFilename(fullName)}_a${student.admissionNo ?? 0}_e${examTypeId}_${Date.now()}`;

  const pdfBuffer = await renderMinimalPdf({
    student,
    examTypeTitle: fullResult?.examType?.title ?? summary.examTypeTitle,
    examTypeId,
    totalMarks: summary.totalMarks,
    subjects: summary.subjects,
    resultDataStatus: fullResult ? "ok" : "empty",
    fileBase,
  });

  await fs.writeFile(storagePath, new Uint8Array(pdfBuffer), {
    recursive: true,
    overwrite: true,
  });

  await fs.writeFile(thumbnailPath, PLACEHOLDER_THUMBNAIL_WEBP, {
    recursive: true,
    overwrite: true,
  });

  const token = base64url(JSON.stringify({ studentId: student.studentId, examTypeId }));
  const previewUrl = `/api/results/${token}`;
  const thumbnailUrl = `/api/file/${thumbnailPath}`;

  if (!republish) {
    await emitPdfPart(writer, artifactId, {
      status: "success",
      data: previewUrl,
      title,
      id: artifactId,
      storagePath,
      previewUrl,
      thumbnailUrl,
    });
  }

  return {
    ok: true,
    artifactId,
    title,
    storagePath,
    previewUrl,
    thumbnailUrl,
    pdfExists: true,
  };
}

export const generateResultPdfTool = createTool({
  id: "generate-result-pdf",
  description:
    "Generate the PDF result for a student. Resolves the student by id/admissionNo/fullName within the active class/section. Emits data-generatePDF parts.",
  inputSchema: reportPdfInputSchema,
  outputSchema: reportPdfOutputSchema,
  execute: async (input, ctx) => {
    const context = ctx as ReportPdfToolContext;
    const tenant = getTenant(context);
    const writer = getWriter(context);

    const republish = input.republish === true;
    const examTypeId = input.examTypeId ?? tenant.examTypeId;
    const previewTitle = sanitizeForFilename(input.fullName ?? "student");
    const provisionalArtifactId = `pdf-${input.studentId ?? input.admissionNo ?? 0}-${examTypeId ?? 0}`;
    const provisionalTitle = `${previewTitle}.pdf`;

    try {
      const rendered = await renderAndWriteResultPdf({
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
        thumbnailUrl: rendered.thumbnailUrl,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await emitPdfPart(writer, provisionalArtifactId, {
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