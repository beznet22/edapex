import { z } from "zod";
import {
  validateRoleWhitelist,
  validateWorkspaceLock,
  WorkspaceMismatchError,
  ForbiddenError,
  type MastraToolContext,
} from "../tenant-context";
import { StudentRepository } from "../../repository/student.repo";
import { StaffRepository } from "../../repository/staff.repo";
import { AuthRepository } from "../../repository/auth.repo";
import { TimelineRepository } from "../../repository/timeline.repo";
import { hashPwd } from "../../helpers/utils";



export const manageAccessSchema = z.object({
  action: z.enum(["ban", "suspend", "reset", "delete"]).describe("The destructive action to perform"),
  targetType: z.enum(["student", "staff"]).describe("The type of entity being targeted"),
  targetId: z.number().int().positive().describe("Numeric ID of the student or staff member"),
  confirmed: z.boolean().optional().default(false).describe("Set to true ONLY if the user has explicitly confirmed the action in the chat. DO NOT set to true on the first invocation."),
  newPassword: z.string().optional().describe("Optional new password for the 'reset' action. If omitted, a random password will be generated."),
});

export type ManageAccessInput = z.infer<typeof manageAccessSchema>;

export const destructiveActionLogic = async (
  _context: any,
  action: "ban" | "suspend" | "reset password" | string,
  params: { targetId: number; confirmed?: boolean },
) => {
  const destructiveActions = ["ban", "suspend", "reset password"];

  if (destructiveActions.includes(action) && !params.confirmed) {
    return {
      status: "NEEDS_CONFIRMATION",
      message: `Are you sure you want to ${action} the entity with ID ${params.targetId}? This action is destructive.`,
      action,
      params,
    };
  }

  return {
    status: "SUCCESS",
    message: `Successfully executed ${action} for ID ${params.targetId}.`,
  };
};

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



export type ManageAccessLogicResult =
  | { status: "NEEDS_CONFIRMATION"; message: string; action?: string; targetType?: string; targetId?: number; type?: "mutation" | "read"; confidence?: number }
  | { status: "ERROR"; errorCode: string; message: string }
  | { status: "SUCCESS"; message: string; action?: string; entityType?: string; targetId?: number; password?: string };

export const manageAccessLogic = async (context: MastraToolContext, input: ManageAccessInput): Promise<ManageAccessLogicResult> => {
  const { tenantContext, getRepo, audit } = context;

  // TODO(phase-3): pipe LLM structured-output confidence into this gate once ActionBar/Workflow suspend/resume lands; defaulting to 1.0 keeps the safety net inert today.
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


export const patchEntitySchema = z
  .object({
    id: z.number().describe("Internal entity ID (stripped out for security, but required by type)"),
    schoolId: z.number().describe("School ID (stripped out for security)"),
    role: z.string().describe("User role (stripped out for security)"),
    studentId: z.number().optional().describe("The ID of the student to update"),
    firstName: z.string().optional().describe("New first name"),
    lastName: z.string().optional().describe("New last name"),
    dateOfBirth: z.string().optional().describe("Date of birth in YYYY-MM-DD format"),
    genderId: z.number().optional().describe("Numeric ID representing gender"),
    studentCategoryId: z.number().optional().describe("Numeric ID representing student category"),
    rollNo: z.number().optional().describe("Assigned roll number within the class"),
  })
  .omit({ id: true, schoolId: true, role: true });
export type PatchEntityPayload = z.infer<typeof patchEntitySchema>;

export const patchEntityLogic = async (context: MastraToolContext, input: PatchEntityPayload) => {
  const { tenantContext, getRepo, audit } = context;

  validateRoleWhitelist(tenantContext, [1, 5, 8]);

  const studentRepo = getRepo(StudentRepository);
  const timelineRepo = getRepo(TimelineRepository);

  try {
    if (input.studentId) {
      const student = await studentRepo.getById(input.studentId);
      if (!student) {
        return {
          status: "ERROR",
          errorCode: "STUDENT_NOT_FOUND",
          message: `Student with ID ${input.studentId} not found.`,
        };
      }

      validateWorkspaceLock(tenantContext, student.classId, student.sectionId);

      const updateData: Record<string, unknown> = {};
      if (input.firstName !== undefined) updateData.firstName = input.firstName;
      if (input.lastName !== undefined) updateData.lastName = input.lastName;
      if (input.dateOfBirth !== undefined) updateData.dateOfBirth = input.dateOfBirth;
      if (input.genderId !== undefined) updateData.genderId = input.genderId;
      if (input.studentCategoryId !== undefined) updateData.studentCategoryId = input.studentCategoryId;
      if (input.rollNo !== undefined) updateData.rollNo = input.rollNo;

      if (input.firstName || input.lastName) {
        const firstName = input.firstName ?? student.firstName ?? "";
        const lastName = input.lastName ?? student.lastName ?? "";
        updateData.fullName = `${firstName} ${lastName}`.trim();
      }

      if (Object.keys(updateData).length === 0) {
        return {
          status: "ERROR",
          errorCode: "NO_CHANGES",
          message: "No valid fields provided for update.",
        };
      }

      await studentRepo.updateStudent({
        studentId: input.studentId,
        ...updateData,
      });

      const auditDescription = JSON.stringify({
        action: "patch",
        type: "patchEntity",
        studentId: input.studentId,
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
        message: `Student ${input.studentId} profile updated successfully.`,
      };
    }

    return {
      status: "ERROR",
      errorCode: "MISSING_ENTITY_ID",
      message: "No studentId provided for patch operation.",
    };
  } catch (error) {
    if (error instanceof WorkspaceMismatchError || error instanceof ForbiddenError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to patch entity: ${errorMessage}`,
    };
  }
};
