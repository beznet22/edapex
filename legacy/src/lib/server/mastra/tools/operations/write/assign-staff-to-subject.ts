import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { bridgeToolContext } from "../../internal/bridge";
import {
  validateRoleWhitelist,
  type MastraToolContext,
} from "../../../tenant-context";
import { AssignmentRepository } from "../../../../repository/assignment.repo";

export const assignStaffToSubjectSchema = z.object({
  staffId: z.number().describe("Numeric ID of the staff member to assign as subject teacher"),
  classId: z.number().describe("Numeric ID of the class"),
  sectionId: z.number().describe("Numeric ID of the section"),
  subjectId: z.number().describe("Numeric ID of the subject"),
  reason: z.string().describe("Human-readable action summary for user approval."),
});

export type AssignStaffToSubjectPayload = z.infer<typeof assignStaffToSubjectSchema>;

type AssignmentSuccess = {
  status: "SUCCESS";
  message: string;
};

type AssignmentError = {
  status: "ERROR";
  errorCode: string;
  message: string;
};

type AssignmentResult = AssignmentSuccess | AssignmentError;

function formatAssignmentOutput(output: unknown): string {
  if (
    typeof output === "object" &&
    output !== null &&
    "message" in output &&
    typeof output.message === "string"
  ) {
    return output.message;
  }
  return JSON.stringify(output);
}

function normalizeError(error: unknown): AssignmentError {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "ERROR",
    errorCode: "UNKNOWN",
    message,
  };
}

export const assignStaffToSubjectLogic = async (
  context: MastraToolContext,
  params: AssignStaffToSubjectPayload,
): Promise<AssignmentResult> => {
  validateRoleWhitelist(context.tenantContext, [1, 5]);

  const repo = context.getRepo(AssignmentRepository);
  try {
    await repo.assignSubjectTeacher({
      classId: params.classId,
      sectionId: params.sectionId,
      subjectId: params.subjectId,
      staffId: params.staffId,
    });
    return {
      status: "SUCCESS",
      message: `Staff ${params.staffId} assigned to teach subject ${params.subjectId} for class ${params.classId}, section ${params.sectionId}.`,
    };
  } catch (error) {
    return normalizeError(error);
  }
};

export const assignStaffToSubjectTool = createTool({
  id: "assign-staff-to-subject",
  description:
    "Assign a staff member as the subject teacher for a specific class, section, and subject in the active academic year.",
  inputSchema: assignStaffToSubjectSchema,
  requireApproval: true,
  execute: async (input: AssignStaffToSubjectPayload, context: ToolExecutionContext) => {
    const ctx = await bridgeToolContext(context);
    return assignStaffToSubjectLogic(ctx, input);
  },
  toModelOutput: (output: unknown) => formatAssignmentOutput(output),
});
