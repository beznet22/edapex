import { z } from "zod";
import { createTool, type ToolExecutionContext } from "@mastra/core/tools";
import { StudentRepository } from "../../../../repository/student.repo";
import { TimelineRepository } from "../../../../repository/timeline.repo";
import {
  validateRoleWhitelist,
  validateWorkspaceLock,
  WorkspaceMismatchError,
  ForbiddenError,
  type MastraToolContext,
} from "../../../tenant-context";
import { bridgeToolContext } from "../../internal/bridge";

export const promoteStudentSchema = z.object({
  studentId: z.number().describe("Numeric ID of the student to promote"),
  classId: z.number().describe("Numeric ID of the destination class"),
  sectionId: z.number().describe("Numeric ID of the destination section"),
  rollNo: z.number().optional().describe("Optional roll number in the destination class"),
  resultStatus: z.string().optional().describe("Promotion result status (defaults to PASSED when omitted)"),
  reason: z.string().describe("Human-readable action summary for user approval."),
});

export type PromoteStudentInput = z.infer<typeof promoteStudentSchema>;

type PromotionResult =
  | { status: "SUCCESS"; studentId: number; classId: number; sectionId: number; message: string }
  | { status: "ERROR"; errorCode: string; message: string };

function isPromotionResult(value: unknown): value is PromotionResult {
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
    "classId" in value && typeof value.classId === "number" &&
    "sectionId" in value && typeof value.sectionId === "number" &&
    "message" in value && typeof value.message === "string"
  );
}

export const promoteStudentLogic = async (
  context: MastraToolContext,
  input: PromoteStudentInput,
): Promise<PromotionResult> => {
  const { tenantContext, getRepo } = context;

  validateRoleWhitelist(tenantContext, [1, 5, 8]);
  validateWorkspaceLock(tenantContext, input.classId, input.sectionId);

  const studentRepo = getRepo(StudentRepository);
  const timelineRepo = getRepo(TimelineRepository);
  const audit = context.audit;

  try {
    const student = await studentRepo.getById(input.studentId);
    if (!student) {
      return {
        status: "ERROR",
        errorCode: "STUDENT_NOT_FOUND",
        message: `Student with ID ${input.studentId} not found.`,
      };
    }

    validateWorkspaceLock(tenantContext, student.classId, student.sectionId);

    const resultStatus = input.resultStatus ?? "PASSED";

    await studentRepo.promoteStudent({
      studentId: input.studentId,
      classId: input.classId,
      sectionId: input.sectionId,
      rollNo: input.rollNo,
      resultStatus,
    });

    const auditDescription = JSON.stringify({
      action: "promote",
      type: "promoteStudent",
      studentId: input.studentId,
      classId: input.classId,
      sectionId: input.sectionId,
      rollNo: input.rollNo,
      resultStatus,
      threadId: audit?.threadId,
      modelId: audit?.modelId,
    });

    await timelineRepo.createTimeline({
      staffStudentId: input.studentId,
      type: "behavioral",
      description: auditDescription,
      schoolId: tenantContext.schoolId,
      academicId: tenantContext.academicId ?? 0,
      createdBy: tenantContext.userId,
    });

    return {
      status: "SUCCESS",
      studentId: input.studentId,
      classId: input.classId,
      sectionId: input.sectionId,
      message: `Student ${student.fullName ?? input.studentId} promoted to Class ${input.classId}, Section ${input.sectionId}.`,
    };
  } catch (error) {
    if (error instanceof WorkspaceMismatchError || error instanceof ForbiddenError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to promote student: ${errorMessage}`,
    };
  }
};

export const promoteStudentTool = createTool({
  id: "promote-student",
  description: "Promote a student to a new class and section for the active academic session, preserving history and assigning fees.",
  inputSchema: promoteStudentSchema,
  requireApproval: true,
  execute: async (input: PromoteStudentInput, context: ToolExecutionContext) => {
    const ctx = await bridgeToolContext(context);
    return promoteStudentLogic(ctx, input);
  },
  toModelOutput: (output: unknown) => {
    if (!isPromotionResult(output)) {
      return "Invalid promotion result.";
    }
    if (output.status === "ERROR") {
      return `Promotion failed: ${output.message}`;
    }
    return output.message ?? `Student ${output.studentId} promoted to Class ${output.classId}, Section ${output.sectionId}.`;
  },
});