import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import {
  validateRoleWhitelist,
  validateWorkspaceLock,
  WorkspaceMismatchError,
  ForbiddenError,
  type MastraToolContext,
} from "../../../tenant-context";
import { StudentRepository } from "../../../../repository/student.repo";
import { TimelineRepository } from "../../../../repository/timeline.repo";
import { bridgeToolContext } from "../../internal/bridge";

export const assignEntitySchema = z.object({
  studentId: z.number().describe("The ID of the student to assign or transfer"),
  targetClassId: z.number().describe("Numeric ID of the destination class"),
  targetSectionId: z.number().describe("Numeric ID of the destination section"),
  academicYearId: z.number().optional().describe("Numeric ID of the academic year (defaults to active term if omitted)"),
  reason: z.string().describe("Human-readable action summary for user approval."),
});
export type AssignEntityInput = z.infer<typeof assignEntitySchema>;

type TransferStudentResult =
  | { status: "SUCCESS"; message: string }
  | { status: "ERROR"; errorCode: string; message: string };

function isTransferStudentResult(value: unknown): value is TransferStudentResult {
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
  return "message" in value && typeof value.message === "string";
}

export const assignEntityLogic = async (
  context: MastraToolContext,
  input: AssignEntityInput,
): Promise<TransferStudentResult> => {
  const { tenantContext, getRepo } = context;

  validateRoleWhitelist(tenantContext, [1, 5, 8]);
  validateWorkspaceLock(tenantContext, input.targetClassId, input.targetSectionId);

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

    await studentRepo.assignClassSection({
      studentId: input.studentId,
      classId: input.targetClassId,
      sectionId: input.targetSectionId,
    });

    const auditDescription = JSON.stringify({
      action: "assign",
      type: "assignEntity",
      studentId: input.studentId,
      classId: input.targetClassId,
      sectionId: input.targetSectionId,
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
      message: `Student ${student.fullName ?? input.studentId} successfully assigned to Class ${input.targetClassId}, Section ${input.targetSectionId}.`,
    };
  } catch (error) {
    if (error instanceof WorkspaceMismatchError || error instanceof ForbiddenError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to assign student: ${errorMessage}`,
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

export const transferStudentTool = createTool({
  id: "transfer-student",
  description: "Transfer an enrolled student to a different class or section within the active school.",
  inputSchema: assignEntitySchema,
  requireApproval: true,
  execute: async (input: AssignEntityInput, context: ToolExecutionContext) => {
    const ctx = await bridgeToolContext(context);
    return assignEntityLogic(ctx, input);
  },
  toModelOutput: (output: unknown) => {
    if (!isTransferStudentResult(output)) {
      return JSON.stringify(output);
    }
    if (output.status === "ERROR") {
      return `Transfer failed: ${output.message}`;
    }
    return output.message;
  },
});