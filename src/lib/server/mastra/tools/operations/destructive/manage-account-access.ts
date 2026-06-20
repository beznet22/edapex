import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { z } from "zod";
import {
  type MastraToolContext,
  validateRoleWhitelist,
  validateWorkspaceLock,
  ForbiddenError,
  WorkspaceMismatchError,
} from "../../../tenant-context";
import { StudentRepository } from "../../../../repository/student.repo";
import { StaffRepository } from "../../../../repository/staff.repo";
import { AuthRepository } from "../../../../repository/auth.repo";
import { TimelineRepository } from "../../../../repository/timeline.repo";
import { hashPwd } from "../../../../helpers/utils";

export const validateIntentConfidence = async (type: "mutation" | "read", confidence: number) => {
  const threshold = type === "mutation" ? 0.9 : 0.7;

  if (confidence < threshold) {
    return {
      status: "NEEDS_CONFIRMATION",
      message: `The agent identified a ${type} intent but with low confidence (${(confidence * 100).toFixed(1)}%). Please confirm the action.`,
      type,
      confidence,
    };
  }

  return {
    status: "SUCCESS",
    type,
    confidence,
  };
};

export const manageAccessSchema = z.object({
  action: z.enum(["ban", "suspend", "reset", "delete"]).describe("The destructive action to perform"),
  targetType: z.enum(["student", "staff"]).describe("The type of entity being targeted"),
  targetId: z.number().int().positive().describe("Numeric ID of the student or staff member"),
  confirmed: z.boolean().optional().default(false).describe("Set to true ONLY if the user has explicitly confirmed the action in the chat. DO NOT set to true on the first invocation."),
  newPassword: z.string().optional().describe("Optional new password for the 'reset' action. If omitted, a random password will be generated."),
});

export type ManageAccessInput = z.input<typeof manageAccessSchema>;

export type ManageAccessLogicResult =
  | { status: "NEEDS_CONFIRMATION"; message: string; action?: string; targetType?: string; targetId?: number; type?: "mutation" | "read"; confidence?: number }
  | { status: "ERROR"; errorCode: string; message: string }
  | { status: "SUCCESS"; message: string; action?: string; entityType?: string; targetId?: number; password?: string };

export const manageAccessLogic = async (context: MastraToolContext, input: ManageAccessInput): Promise<ManageAccessLogicResult> => {
  const { tenantContext, getRepo, audit } = context;

  const confidence = 1.0;
  const confidenceCheck = await validateIntentConfidence("mutation", confidence);
  if (confidenceCheck.status === "NEEDS_CONFIRMATION") {
    return {
      status: "NEEDS_CONFIRMATION",
      message: confidenceCheck.message ?? "Low-confidence intent requires confirmation.",
      type: confidenceCheck.type,
      confidence: confidenceCheck.confidence,
    };
  }

  validateRoleWhitelist(tenantContext, [1, 5]);

  const { action, targetType, targetId, confirmed, newPassword } = input;
  const destructiveActions = ["ban", "suspend", "reset", "delete"];

  if (destructiveActions.includes(action) && !confirmed) {
    return {
      status: "NEEDS_CONFIRMATION",
      message: `Are you sure you want to ${action} the ${targetType} with ID ${targetId}? This action is destructive.`,
      action,
      targetType,
      targetId,
    };
  }

  const studentRepo = getRepo(StudentRepository);
  const staffRepo = getRepo(StaffRepository);
  const authRepo = getRepo(AuthRepository);
  const timelineRepo = getRepo(TimelineRepository);

  try {
    let result: Record<string, unknown> = {};
    let fullName: string | null = null;

    if (targetType === "student") {
      const student = await studentRepo.getById(targetId);
      if (!student) {
        return {
          status: "ERROR",
          errorCode: "STUDENT_NOT_FOUND",
          message: `Student with ID ${targetId} not found.`,
        };
      }
      fullName = student.fullName;

      validateWorkspaceLock(tenantContext, student.classId, student.sectionId);

      if (action === "ban" || action === "suspend") {
        await studentRepo.updateStudentStatus({ studentId: targetId, active: false });
      } else if (action === "delete") {
        await studentRepo.deleteStudent({ studentId: targetId });
      } else if (action === "reset") {
        if (!student.userId) {
          return {
            status: "ERROR",
            errorCode: "NO_USER_ACCOUNT",
            message: "Student has no associated user account.",
          };
        }
        const finalPassword = newPassword || Math.random().toString(36).slice(-8);
        await authRepo.updateUserPassword(student.userId, hashPwd(finalPassword));
        result = { password: finalPassword };
      }
    } else if (targetType === "staff") {
      const staff = await staffRepo.getById(targetId);
      if (!staff) {
        return {
          status: "ERROR",
          errorCode: "STAFF_NOT_FOUND",
          message: `Staff with ID ${targetId} not found.`,
        };
      }
      fullName = staff.fullName;

      if (action === "ban" || action === "suspend") {
        await staffRepo.updateStaffStatus({ teacherId: targetId, active: false });
      } else if (action === "delete") {
        await staffRepo.deleteStaff({ teacherId: targetId });
      } else if (action === "reset") {
        if (!staff.userId) {
          return {
            status: "ERROR",
            errorCode: "NO_USER_ACCOUNT",
            message: "Staff has no associated user account.",
          };
        }
        const finalPassword = newPassword || Math.random().toString(36).slice(-8);
        await authRepo.updateUserPassword(staff.userId, hashPwd(finalPassword));
        result = { password: finalPassword };
      }
    } else {
      return {
        status: "ERROR",
        errorCode: "INVALID_TARGET_TYPE",
        message: `Unknown target type: ${targetType}.`,
      };
    }

    const auditDescription = JSON.stringify({
      action,
      type: "manageAccess",
      targetType,
      targetId,
      threadId: audit?.threadId,
      modelId: audit?.modelId,
    });

    await timelineRepo.createTimeline({
      staffStudentId: targetId,
      type: "behavioral",
      description: auditDescription,
      schoolId: tenantContext.schoolId,
      academicId: tenantContext.academicId ?? 0,
      createdBy: tenantContext.userId,
    });

    const actionMessage =
      action === "reset"
        ? `Password reset successfully for ${targetType} ${fullName ?? targetId}.`
        : `Successfully executed ${action} on ${targetType} ${fullName ?? targetId}.`;

    return {
      status: "SUCCESS",
      message: actionMessage,
      ...result,
    };
  } catch (error) {
    if (error instanceof WorkspaceMismatchError || error instanceof ForbiddenError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    if (errorMessage === "USER_NOT_FOUND") {
      return {
        status: "ERROR",
        errorCode: "USER_NOT_FOUND",
        message: `${targetType} with ID ${targetId} not found.`,
      };
    }
    return { status: "ERROR", errorCode: "UNKNOWN", message: `Failed to ${action}: ${errorMessage}` };
  }
};

function isMastraToolContext(value: unknown): value is MastraToolContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "tenantContext" in value &&
    "getRepo" in value
  );
}

function hasMessageField(value: unknown): value is { message: unknown } {
  return typeof value === "object" && value !== null && "message" in value;
}

export const manageAccountAccessTool = createTool({
  id: "manage-account-access",
  description: "Manage the account state of a student or staff member: suspend, restore, reset password, or delete.",
  inputSchema: manageAccessSchema,
  execute: async (input: ManageAccessInput, context: ToolExecutionContext) => {
    if (!isMastraToolContext(context)) {
      throw new Error("manage-account-access requires a valid Mastra tool context");
    }
    return manageAccessLogic(context, input);
  },
  toModelOutput: (output: unknown) => {
    if (hasMessageField(output) && typeof output.message === "string") {
      return output.message;
    }
    return JSON.stringify(output);
  },
});
