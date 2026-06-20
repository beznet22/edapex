import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import {
  validateRoleWhitelist,
  validateWorkspaceLock,
  type MastraToolContext,
} from "../../../tenant-context";
import { StudentRepository } from "../../../../repository/student.repo";
import { TimelineRepository } from "../../../../repository/timeline.repo";

export const onboardEntitySchema = z.object({
  studentDetails: z.object({
    firstName: z.string().describe("The student's first name"),
    lastName: z.string().describe("The student's last name"),
    gender: z.enum(["Male", "Female"]).describe("The student's gender"),
    category: z.string().describe("Student category (e.g., DAYCARE, LOWER BASIC)"),
  }).describe("Core student biographical information"),
  guardianDetails: z.object({
    relation: z.enum(["Father", "Mother", "Other"]).describe("Guardian's relationship to the student"),
    guardianName: z.string().describe("Full name of the primary guardian"),
    phone: z.string().describe("Guardian's primary phone number"),
    email: z.string().email().describe("Guardian's email address"),
  }).describe("Primary guardian contact details"),
  enrollmentDetails: z.object({
    classId: z.number().int().positive().describe("Numeric ID of the class to enroll in"),
    sectionId: z.number().int().positive().describe("Numeric ID of the section to enroll in"),
  }).describe("Target enrollment destination for the new student"),
});

export type OnboardEntityPayload = z.infer<typeof onboardEntitySchema>;

type EnrollStudentResult =
  | { status: "SUCCESS"; studentId: number; admissionNumber: number | null; message: string }
  | { status: "ERROR"; errorCode: string; message: string };

function isEnrollStudentResult(value: unknown): value is EnrollStudentResult {
  if (typeof value !== "object" || value === null) return false;
  if (!("status" in value)) return false;
  const status = value.status;
  if (status !== "SUCCESS" && status !== "ERROR") return false;
  if (status === "ERROR") {
    return (
      "errorCode" in value && typeof value.errorCode === "string" &&
      "message" in value && typeof value.message === "string"
    );
  }
  return (
    "studentId" in value && typeof value.studentId === "number" &&
    "admissionNumber" in value && (typeof value.admissionNumber === "number" || value.admissionNumber === null) &&
    "message" in value && typeof value.message === "string"
  );
}

export const onboardEntityLogic = async (
  context: MastraToolContext,
  payload: OnboardEntityPayload,
): Promise<EnrollStudentResult> => {
  const { tenantContext, getRepo } = context;

  validateRoleWhitelist(tenantContext, [1, 5, 8]);
  validateWorkspaceLock(
    tenantContext,
    payload.enrollmentDetails.classId,
    payload.enrollmentDetails.sectionId,
  );

  const studentRepo = getRepo(StudentRepository);
  const timelineRepo = getRepo(TimelineRepository);
  const audit = context.audit;

  try {
    const genderId = await studentRepo.resolveGenderId(payload.studentDetails.gender);

    if (!genderId) {
      return {
        status: "ERROR",
        errorCode: "GENDER_NOT_FOUND",
        message: `Gender "${payload.studentDetails.gender}" not found in system.`,
      };
    }

    const studentCategoryId = await studentRepo.resolveStudentCategoryId(payload.studentDetails.category);

    if (!studentCategoryId) {
      return {
        status: "ERROR",
        errorCode: "CATEGORY_NOT_FOUND",
        message: `Student category "${payload.studentDetails.category}" not found in system.`,
      };
    }

    const createInput = {
      firstName: payload.studentDetails.firstName,
      lastName: payload.studentDetails.lastName,
      classId: payload.enrollmentDetails.classId,
      sectionId: payload.enrollmentDetails.sectionId,
      genderId,
      studentCategoryId,
      schoolId: tenantContext.schoolId,
      guardianRelation: payload.guardianDetails.relation.toLowerCase() as "father" | "mother" | "other",
      guardiansName: payload.guardianDetails.guardianName,
      guardiansMobile: payload.guardianDetails.phone,
      guardiansEmail: payload.guardianDetails.email,
    };

    const result = await studentRepo.creatStudentIfNotExists(createInput);

    const resultRecord = result as { id: number; admissionNo: number | null };

    const auditDescription = JSON.stringify({
      action: "onboard",
      type: "onboardEntity",
      studentId: resultRecord.id,
      threadId: audit?.threadId,
      modelId: audit?.modelId,
    });

    await timelineRepo.createTimeline({
      staffStudentId: resultRecord.id,
      type: "behavioral",
      description: auditDescription,
      schoolId: tenantContext.schoolId,
      academicId: tenantContext.academicId ?? 0,
      createdBy: tenantContext.userId,
    });

    return {
      status: "SUCCESS",
      studentId: resultRecord.id,
      admissionNumber: resultRecord.admissionNo,
      message: "Student registered successfully.",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    if (errorMessage === "USER_EXISTS") {
      return {
        status: "ERROR",
        errorCode: "USER_EXISTS",
        message:
          "A user with this email or identity already exists. Did you mean to /update their profile instead?",
      };
    }
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to onboard student: ${errorMessage}`,
    };
  }
};

function assertMastraToolContext(
  context: ToolExecutionContext,
): asserts context is MastraToolContext & ToolExecutionContext {
  if (!("tenantContext" in context) || !("getRepo" in context)) {
    throw new Error("Invalid tool execution context: expected MastraToolContext");
  }
}

export const enrollStudentTool = createTool({
  id: "enroll-student",
  description: "Enroll a new student into a class, with their guardian record, in the active academic context.",
  inputSchema: onboardEntitySchema,
  execute: async (input: OnboardEntityPayload, context: ToolExecutionContext) => {
    assertMastraToolContext(context);
    return onboardEntityLogic(context, input);
  },
  toModelOutput: (output: unknown) => {
    if (!isEnrollStudentResult(output)) {
      return JSON.stringify(output);
    }
    if (output.status === "ERROR") {
      return `Enrollment failed: ${output.message}`;
    }
    return output.message;
  },
});