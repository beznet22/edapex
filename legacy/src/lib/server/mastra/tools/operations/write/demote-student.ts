import { z } from "zod";
import { createTool, type ToolExecutionContext } from "@mastra/core/tools";
import { TimelineRepository } from "../../../../repository/timeline.repo";
import { StudentRepository } from "../../../../repository/student.repo";
import {
  validateRoleWhitelist,
  validateWorkspaceLock,
  WorkspaceMismatchError,
  ForbiddenError,
  type MastraToolContext,
} from "../../../tenant-context";
import { bridgeToolContext } from "../../internal/bridge";

export const demoteStudentSchema = z.object({
  studentId: z.number().describe("Numeric ID of the student to demote/revert promotion"),
  reason: z.string().describe("Human-readable action summary for user approval."),
});

export type DemoteStudentInput = z.infer<typeof demoteStudentSchema>;

type DemotionResult =
  | { status: "SUCCESS"; studentId: number; message: string }
  | { status: "ERROR"; errorCode: string; message: string };

function isDemotionResult(value: unknown): value is DemotionResult {
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
    "message" in value && typeof value.message === "string"
  );
}

export const demoteStudentLogic = async (
  context: MastraToolContext,
  input: DemoteStudentInput,
): Promise<DemotionResult> => {
  const { tenantContext, getRepo } = context;

  validateRoleWhitelist(tenantContext, [1, 5, 8]);

  const studentRepo = getRepo(StudentRepository);
  const timelineRepo = getRepo(TimelineRepository);
  const audit = context.audit;

  try {
    const student = await studentRepo.getRawStudentById(input.studentId);
    if (!student) {
      return {
        status: "ERROR",
        errorCode: "STUDENT_NOT_FOUND",
        message: `Student with ID ${input.studentId} not found.`,
      };
    }

    validateWorkspaceLock(tenantContext, student.classId, student.sectionId);

    const latestPromotion = await studentRepo.getLatestPromotion(input.studentId);
    if (!latestPromotion) {
      return {
        status: "ERROR",
        errorCode: "NO_PROMOTION_RECORD",
        message: `No promotion record found for student ${input.studentId}.`,
      };
    }

    const currentClassId = latestPromotion.currentClassId;
    const currentSectionId = latestPromotion.currentSectionId;
    const currentSessionId = latestPromotion.currentSessionId;
    const previousClassId = latestPromotion.previousClassId;
    const previousSectionId = latestPromotion.previousSectionId;
    const previousSessionId = latestPromotion.previousSessionId;

    if (
      currentClassId == null ||
      currentSectionId == null ||
      currentSessionId == null ||
      previousClassId == null ||
      previousSectionId == null ||
      previousSessionId == null
    ) {
      return {
        status: "ERROR",
        errorCode: "INVALID_PROMOTION_RECORD",
        message: `The latest promotion record for student ${input.studentId} is missing class/section/session values.`,
      };
    }

    await studentRepo.demoteStudent({
      studentId: input.studentId,
      promotionId: latestPromotion.id,
      currentClassId,
      currentSectionId,
      currentSessionId,
      previousClassId,
      previousSectionId,
      previousSessionId,
      previousRollNumber: latestPromotion.previousRollNumber,
    });

    const auditDescription = JSON.stringify({
      action: "demote",
      type: "demoteStudent",
      studentId: input.studentId,
      previousClassId,
      previousSectionId,
      previousSessionId,
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
      message: `Student ${input.studentId} demoted to previous class/section successfully.`,
    };
  } catch (error) {
    if (error instanceof WorkspaceMismatchError || error instanceof ForbiddenError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to demote student: ${errorMessage}`,
    };
  }
};

export const demoteStudentTool = createTool({
  id: "demote-student",
  description: "Revert the most recent promotion for a student, restoring their previous class, section, and active student record.",
  inputSchema: demoteStudentSchema,
  requireApproval: true,
  execute: async (input: DemoteStudentInput, context: ToolExecutionContext) => {
    const ctx = await bridgeToolContext(context);
    return demoteStudentLogic(ctx, input);
  },
  toModelOutput: (output: unknown) => {
    if (!isDemotionResult(output)) {
      return "Invalid demotion result.";
    }
    if (output.status === "ERROR") {
      return `Demotion failed: ${output.message}`;
    }
    return output.message ?? `Student ${output.studentId} demoted successfully.`;
  },
});
