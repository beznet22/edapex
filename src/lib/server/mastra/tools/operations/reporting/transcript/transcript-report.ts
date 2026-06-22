import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { streamWithAutoRetry, type StreamWriterLike } from "$lib/server/mastra/agent-stream-retry";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import { getDatabase } from "$lib/server/db";
import { smStudents } from "$lib/server/db/sms-schema";
import { and, eq, like, or, type SQL } from "drizzle-orm";
import type { StudentDetails } from "$lib/server/repository/student.repo";

interface ReportToolContext {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
  };
  writer?: StreamWriterLike;
  abortSignal?: AbortSignal;
}

function getTenant(ctx: ReportToolContext): TenantContext {
  const tenant = ctx.requestContext?.get("tenantContext") as TenantContext | undefined;
  if (!tenant) {
    throw new Error("TENANT_CONTEXT_REQUIRED: transcript-report requires an active tenantContext");
  }
  return tenant;
}

function getWriter(ctx: ReportToolContext): StreamWriterLike | undefined {
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

type StudentCriteria = {
  studentId?: number | null;
  admissionNo?: number | null;
  fullName?: string | null;
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
  const nameQuery = criteria.fullName;
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
    const label = criteria.fullName ?? "";
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

async function getDocumentAgent() {
  const { mastra } = await import("$lib/server/mastra");
  const agent = mastra.getAgent("document");
  if (!agent) {
    throw new Error("AGENT_NOT_REGISTERED: document agent is not registered on the Mastra instance");
  }
  return agent;
}

const transcriptReportInputSchema = z.object({
  studentId: z.number().optional(),
  admissionNo: z.number().optional(),
  fullName: z.string().optional(),
  academicId: z.number().optional(),
  classId: z.number().optional(),
  sectionId: z.number().optional(),
});

const transcriptReportOutputSchema = z.object({
  artifactId: z.string(),
  title: z.string(),
  markdown: z.string(),
  status: z.literal("success"),
});

type TranscriptReportInput = z.infer<typeof transcriptReportInputSchema>;

export const transcriptReportTool = createTool({
  id: "transcript-report",
  description:
    "Compute the multi-term transcript for a student and render it as a markdown document via the document agent. " +
    "Emits data-createDocument stream parts (processing → streaming → success) and persists the final markdown to exams/transcripts/ay-<academicId>/<studentId>.md.",
  inputSchema: transcriptReportInputSchema,
  outputSchema: transcriptReportOutputSchema,
  execute: async (input: TranscriptReportInput, ctx) => {
    const context = ctx as ReportToolContext;
    const tenant = getTenant(context);
    const writer = getWriter(context);

    const student = await resolveStudent(
      {
        studentId: input.studentId,
        admissionNo: input.admissionNo,
        fullName: input.fullName,
        classId: input.classId,
        sectionId: input.sectionId,
      },
      tenant.classId,
      tenant.sectionId,
    );

    const academicId = input.academicId ?? tenant.academicId ?? student.academicId ?? null;
    if (academicId === null) {
      throw new Error("ACADEMIC_ID_REQUIRED: no academicId in input, tenant, or student record");
    }

    const assessment = await createAssessmentServiceForRequest(tenant);
    const transcript = await assessment.getTranscript({
      studentId: student.studentId,
      academicId,
      withImages: false,
    });
    if (transcript === null) {
      throw new Error(
        `TRANSCRIPT_NOT_FOUND: no transcript data for studentId=${student.studentId} academicId=${academicId}`,
      );
    }

    const studentName = student.fullName ?? "Student";
    const academicYearTitle = transcript.academicYear?.title ?? String(academicId);
    const artifactId = `report-transcript-${student.studentId}-${academicId}`;
    const title = `${studentName} — Transcript ${academicYearTitle}`;

    if (writer) {
      await writer.write({
        type: "data-createDocument",
        id: artifactId,
        data: { status: "processing", content: "", title, id: artifactId },
      } as never);
    }

    const documentAgent = await getDocumentAgent();

    const prompt = [
      `Format this multi-term academic transcript for ${studentName} into clean, well-structured markdown.`,
      "",
      "Render a table with columns: Subject, Term 1, Term 2, Term 3, Total, Grade.",
      "Below the table, write a one-paragraph \"Year Overview\" summary of the student's yearly performance, their position relative to the class average, and any notable trends across the three terms.",
      "",
      "Preserve every factual value, subject name, score, and grade from the JSON below.",
      "Use proper markdown headings (# ## ###), lists, tables, and emphasis where appropriate.",
      "",
      "```json",
      JSON.stringify(transcript, null, 2),
      "```",
    ].join("\n");

    const stream = await streamWithAutoRetry({
      stream: () =>
        documentAgent.stream(prompt, {
          ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
          ...(context.requestContext ? { requestContext: context.requestContext as never } : {}),
        }),
      abortSignal: context.abortSignal,
      writer: writer ?? { write: async () => {} },
    });

    let markdown = "";
    for await (const chunk of stream.textStream) {
      if (typeof chunk !== "string" || chunk.length === 0) continue;
      markdown += chunk;
      if (writer) {
        await writer.write({
          type: "data-createDocument",
          id: artifactId,
          data: { status: "streaming", content: markdown, title, id: artifactId },
        } as never);
      }
    }

    const fs = await resolveFilesystem(tenant);
    const persistPath = `exams/transcripts/ay-${academicId}/${student.studentId}.md`;
    await fs.writeFile(persistPath, markdown, { recursive: true });

    if (writer) {
      await writer.write({
        type: "data-createDocument",
        id: artifactId,
        data: { status: "success", content: markdown, title, id: artifactId },
      } as never);
    }

    return { artifactId, title, markdown, status: "success" as const };
  },
});
