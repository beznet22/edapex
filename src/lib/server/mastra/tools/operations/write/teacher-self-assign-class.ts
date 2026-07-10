import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import {
  ForbiddenError,
  type MastraToolContext,
  type TenantContext,
} from "../../../tenant-context";
import { AssignmentRepository } from "../../../../repository/assignment.repo";

export const teacherSelfAssignClassSchema = z.object({
  classId: z.number().describe("Numeric ID of the class"),
  sectionId: z.number().describe("Numeric ID of the section"),
  reason: z.string().describe("Human-readable action summary for user approval."),
});

export type TeacherSelfAssignClassPayload = z.infer<typeof teacherSelfAssignClassSchema>;

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

function validateIsStaff(context: TenantContext): void {
  if (context.staffId <= 0) {
    throw new ForbiddenError();
  }
}

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

export const teacherSelfAssignClassLogic = async (
  context: MastraToolContext,
  params: TeacherSelfAssignClassPayload,
): Promise<AssignmentResult> => {
  validateIsStaff(context.tenantContext);

  const repo = context.getRepo(AssignmentRepository);
  try {
    const result = await repo.assignClassTeacher({
      classId: params.classId,
      sectionId: params.sectionId,
      staffId: context.tenantContext.staffId,
    });
    return {
      status: "SUCCESS",
      message: `You are assigned as class teacher for class ${params.classId}, section ${params.sectionId} (assignment ${result.assignClassTeacherId}).`,
    };
  } catch (error) {
    return normalizeError(error);
  }
};

function assertMastraToolContext(
  context: ToolExecutionContext,
): asserts context is MastraToolContext & ToolExecutionContext {
  if (!("tenantContext" in context) || !("getRepo" in context)) {
    throw new Error("Invalid tool execution context: expected MastraToolContext");
  }
}

export const teacherSelfAssignClassTool = createTool({
  id: "teacher-self-assign-class",
  description:
    "Allow the currently authenticated teacher to assign themselves as the class teacher for a class and section.",
  inputSchema: teacherSelfAssignClassSchema,
  requireApproval: true,
  execute: async (input: TeacherSelfAssignClassPayload, context: ToolExecutionContext) => {
    assertMastraToolContext(context);
    return teacherSelfAssignClassLogic(context, input);
  },
  toModelOutput: (output: unknown) => formatAssignmentOutput(output),
});
