import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getDatabase } from "../../../../db";
import { smStudents } from "../../../../db/sms-schema";
import { and, eq, like, or, type SQL } from "drizzle-orm";
import type { StreamWriterLike } from "../../../agent-stream-retry";
import { resolveExamTypeId, type TenantContext } from "../../../tenant-context";
import { createAssessmentServiceForRequest } from "../../../../service/assessment.service";
import type { StudentDetails } from "../../../../repository/student.repo";
import type { Marksheet, MarksRecord } from "../../../../../schema/marksheet";

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

const viewStudentResultSchema = z
  .object({
    studentId: z.number().optional(),
    admissionNo: z.number().optional(),
    fullName: z.string().optional(),
    examTypeId: z.number().optional(),
    academicYearId: z.number().optional(),
  })
  .refine(
    (data) =>
      data.studentId !== undefined ||
      data.admissionNo !== undefined ||
      data.fullName !== undefined,
    {
      message: "At least one of studentId, admissionNo, or fullName is required",
      path: ["studentId"],
    },
  );

type ViewStudentResultInput = z.infer<typeof viewStudentResultSchema>;

const viewStudentResultOutputSchema = z.object({
  status: z.enum(["SUCCESS", "NOT_FOUND"]),
  studentId: z.number().optional(),
  examTypeId: z.number().optional(),
});

type ViewStudentResultResult =
  | { status: "SUCCESS"; studentId: number; examTypeId: number }
  | { status: "NOT_FOUND" };

async function viewStudentResultLogic(
  context: ReportPdfToolContext,
  params: ViewStudentResultInput,
  writer: StreamWriterLike | undefined,
): Promise<ViewStudentResultResult> {
  const tenant = getTenant(context);

  const student = await resolveStudent(
    {
      studentId: params.studentId,
      admissionNo: params.admissionNo,
      fullName: params.fullName,
    },
    tenant.classId,
    tenant.sectionId,
  );

  const explicitExamTypeId = params.examTypeId ?? tenant.examTypeId;
  const examTypeId = await resolveExamTypeId(tenant.schoolId, explicitExamTypeId ?? null);
  if (examTypeId === null) {
    throw new Error("EXAM_TYPE_REQUIRED: no examTypeId in input or active tenant context");
  }

  const assessment = await createAssessmentServiceForRequest(tenant);
  const result: Marksheet | null = await assessment.getStudentResult({
    id: student.studentId,
    examId: examTypeId,
    isAdminNo: false,
    withImages: false,
  });

  if (result === null) {
    return { status: "NOT_FOUND" };
  }

  return {
    status: "SUCCESS",
    studentId: student.studentId,
    examTypeId,
  };
}

export const viewStudentResultTool = createTool({
  id: "view-student-result",
  description:
    "Fetch a student's result for the active exam type and open it as a markdown document in the editor panel. " +
    "Resolves the student by id/admissionNo/fullName within the active class/section and returns the formatted marksheet markdown.",
  inputSchema: viewStudentResultSchema,
  outputSchema: viewStudentResultOutputSchema,
  execute: async (input, ctx) => {
    const context = ctx as ReportPdfToolContext;
    const writer = getWriter(context);
    return viewStudentResultLogic(context, input, writer);
  },
});

function getWriter(ctx: ReportPdfToolContext): StreamWriterLike | undefined {
  return ctx.writer;
}
