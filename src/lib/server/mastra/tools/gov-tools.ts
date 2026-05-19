import { z } from "zod";
import { validateRoleWhitelist, validateWorkspaceLock, type MastraToolContext } from "../tenant-context";
import { StudentRepository } from "../../repository/student.repo";
import { StaffRepository } from "../../repository/staff.repo";
import { AuthRepository } from "../../repository/auth.repo";
import { TimelineRepository } from "../../repository/timeline.repo";
import { hashPwd } from "../../helpers/utils";
import { smStaffs } from "../../db/sms-schema";
import { eq } from "drizzle-orm";

export const switchWorkspaceSchema = z.object({
  newClassId: z.number().int().positive(),
  newSectionId: z.number().int().positive(),
});

export const manageAccessSchema = z.object({
  action: z.enum(["ban", "suspend", "reset", "delete"]),
  targetType: z.enum(["student", "staff"]),
  targetId: z.number().int().positive(),
  confirmed: z.boolean().optional().default(false),
  newPassword: z.string().optional(),
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

export const switchWorkspaceLogic = async (context: any, newClassId: number, newSectionId: number) => {
  const { createTenantContext } = await import("../tenant-context");

  const newContext = createTenantContext({
    ...context,
    classId: newClassId,
    sectionId: newSectionId,
  });

  return {
    status: "SUCCESS",
    message: `Switched to Class ${newClassId} - Section ${newSectionId}.`,
    newContext,
  };
};

export const manageAccessLogic = async (context: MastraToolContext, input: ManageAccessInput) => {
  const { tenantContext, getRepo, audit } = context;

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
      const [staff] = await staffRepo.db.select().from(smStaffs).where(eq(smStaffs.id, targetId)).limit(1);
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
