import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTool, type ToolExecutionContext } from "@mastra/core/tools";
import {
  validateRoleWhitelist,
  validateWorkspaceLock,
  WorkspaceMismatchError,
  ForbiddenError,
  type MastraToolContext,
} from "../../../tenant-context";
import { StudentRepository } from "../../../../repository/student.repo";
import { StaffRepository } from "../../../../repository/staff.repo";
import { TimelineRepository } from "../../../../repository/timeline.repo";
import { smStaffs, users } from "../../../../db/sms-schema";

export const updateRecordSchema = z.object({
  entityType: z
    .enum(["student", "staff", "self"])
    .describe("Which entity type to update: student (requires entityId), staff (requires entityId), or self (uses active staff context)"),
  entityId: z.number().optional().describe("Numeric ID of the target entity. Required for entityType=student and entityType=staff; ignored for entityType=self."),
  firstName: z.string().optional().describe("New first name"),
  lastName: z.string().optional().describe("New last name"),
  dateOfBirth: z.string().optional().describe("Date of birth in YYYY-MM-DD format"),
  mobile: z.string().optional().describe("New mobile phone number"),
  studentCategoryId: z.number().optional().describe("Numeric ID representing student category (student only)"),
  photoPath: z.string().optional().describe("Relative path of the uploaded photo to commit to the record"),
});

export type UpdateRecordPayload = z.infer<typeof updateRecordSchema>;

type UpdateRecordResult =
  | { status: "SUCCESS"; entityType: "student" | "staff" | "self"; entityId: number; message: string }
  | { status: "ERROR"; errorCode: string; message: string };

function isUpdateRecordResult(value: unknown): value is UpdateRecordResult {
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
    "entityType" in value &&
    (value.entityType === "student" || value.entityType === "staff" || value.entityType === "self") &&
    "entityId" in value && typeof value.entityId === "number" &&
    "message" in value && typeof value.message === "string"
  );
}

function parseDateOfBirth(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

async function updateStudentRecord(
  context: MastraToolContext,
  payload: UpdateRecordPayload,
  targetStudentId: number,
): Promise<UpdateRecordResult> {
  validateRoleWhitelist(context.tenantContext, [1, 5, 8]);

  const studentRepo = context.getRepo(StudentRepository);
  const timelineRepo = context.getRepo(TimelineRepository);
  const audit = context.audit;

  const student = await studentRepo.getById(targetStudentId);
  if (!student) {
    return {
      status: "ERROR",
      errorCode: "STUDENT_NOT_FOUND",
      message: `Student with ID ${targetStudentId} not found.`,
    };
  }

  validateWorkspaceLock(context.tenantContext, student.classId, student.sectionId);

  const updateData: Record<string, unknown> = {};
  if (payload.firstName !== undefined) updateData.firstName = payload.firstName;
  if (payload.lastName !== undefined) updateData.lastName = payload.lastName;
  if (payload.dateOfBirth !== undefined) updateData.dateOfBirth = payload.dateOfBirth;
  if (payload.mobile !== undefined) updateData.mobile = payload.mobile;
  if (payload.studentCategoryId !== undefined) updateData.studentCategoryId = payload.studentCategoryId;

  if (payload.firstName || payload.lastName) {
    const firstName = payload.firstName ?? student.firstName ?? "";
    const lastName = payload.lastName ?? student.lastName ?? "";
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) updateData.fullName = fullName;
  }

  const hasBiodataChanges = Object.keys(updateData).length > 0;
  const hasPhotoChange = payload.photoPath !== undefined;

  if (!hasBiodataChanges && !hasPhotoChange) {
    return {
      status: "ERROR",
      errorCode: "NO_CHANGES",
      message: "No valid fields provided for update.",
    };
  }

  try {
    if (hasBiodataChanges) {
      await studentRepo.updateStudent({
        studentId: targetStudentId,
        ...updateData,
      });
    }

    if (hasPhotoChange && payload.photoPath !== undefined) {
      await studentRepo.updateStudentPhoto(targetStudentId, payload.photoPath);
    }

    const auditDescription = JSON.stringify({
      action: "patch",
      type: "updateRecord",
      entityType: "student",
      studentId: targetStudentId,
      fields: Object.keys(updateData),
      photoUpdated: hasPhotoChange,
      threadId: audit?.threadId,
      modelId: audit?.modelId,
    });

    await timelineRepo.createTimeline({
      staffStudentId: targetStudentId,
      type: "behavioral",
      description: auditDescription,
      schoolId: context.tenantContext.schoolId,
      academicId: context.tenantContext.academicId ?? 0,
      createdBy: context.tenantContext.userId,
    });

    return {
      status: "SUCCESS",
      entityType: "student",
      entityId: targetStudentId,
      message: `Student ${targetStudentId} profile updated successfully.`,
    };
  } catch (error) {
    if (error instanceof WorkspaceMismatchError || error instanceof ForbiddenError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to update student record: ${errorMessage}`,
    };
  }
}

async function updateStaffRecord(
  context: MastraToolContext,
  payload: UpdateRecordPayload,
  targetStaffId: number,
  allowRoleBypass: boolean,
): Promise<UpdateRecordResult> {
  if (!allowRoleBypass) {
    validateRoleWhitelist(context.tenantContext, [1, 5, 8]);
  }

  const staffRepo = context.getRepo(StaffRepository);
  const timelineRepo = context.getRepo(TimelineRepository);
  const audit = context.audit;

  const staff = await staffRepo.getById(targetStaffId);
  if (!staff) {
    return {
      status: "ERROR",
      errorCode: "STAFF_NOT_FOUND",
      message: `Staff with ID ${targetStaffId} not found.`,
    };
  }

  const staffUpdate: Record<string, unknown> = {};
  if (payload.firstName !== undefined) staffUpdate.firstName = payload.firstName;
  if (payload.lastName !== undefined) staffUpdate.lastName = payload.lastName;
  if (payload.mobile !== undefined) staffUpdate.mobile = payload.mobile;

  const dob = parseDateOfBirth(payload.dateOfBirth);
  if (dob !== undefined) staffUpdate.dateOfBirth = dob;

  if (payload.firstName !== undefined || payload.lastName !== undefined) {
    const firstName = payload.firstName ?? staff.firstName ?? "";
    const lastName = payload.lastName ?? staff.lastName ?? "";
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) staffUpdate.fullName = fullName;
  }

  const hasBiodataChanges = Object.keys(staffUpdate).length > 0;
  const hasPhotoChange = payload.photoPath !== undefined;

  if (!hasBiodataChanges && !hasPhotoChange) {
    return {
      status: "ERROR",
      errorCode: "NO_CHANGES",
      message: "No valid fields provided for update.",
    };
  }

  try {
    if (hasBiodataChanges) {
      await staffRepo.db
        .update(smStaffs)
        .set(staffUpdate)
        .where(eq(smStaffs.id, targetStaffId));

      if (staff.userId && (payload.firstName !== undefined || payload.lastName !== undefined)) {
        const firstName = payload.firstName ?? staff.firstName ?? "";
        const lastName = payload.lastName ?? staff.lastName ?? "";
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName) {
          await staffRepo.db
            .update(users)
            .set({ fullName })
            .where(eq(users.id, staff.userId));
        }
      }
    }

    if (hasPhotoChange && payload.photoPath !== undefined) {
      await staffRepo.db
        .update(smStaffs)
        .set({ staffPhoto: payload.photoPath })
        .where(eq(smStaffs.id, targetStaffId));
    }

    const auditDescription = JSON.stringify({
      action: "patch",
      type: "updateRecord",
      entityType: "staff",
      staffId: targetStaffId,
      fields: Object.keys(staffUpdate),
      photoUpdated: hasPhotoChange,
      threadId: audit?.threadId,
      modelId: audit?.modelId,
    });

    await timelineRepo.createTimeline({
      staffStudentId: targetStaffId,
      type: "behavioral",
      description: auditDescription,
      schoolId: context.tenantContext.schoolId,
      academicId: context.tenantContext.academicId ?? 0,
      createdBy: context.tenantContext.userId,
    });

    return {
      status: "SUCCESS",
      entityType: "staff",
      entityId: targetStaffId,
      message: `Staff ${targetStaffId} profile updated successfully.`,
    };
  } catch (error) {
    if (error instanceof WorkspaceMismatchError || error instanceof ForbiddenError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to update staff record: ${errorMessage}`,
    };
  }
}

export const updateRecordLogic = async (
  context: MastraToolContext,
  payload: UpdateRecordPayload,
): Promise<UpdateRecordResult> => {
  if (payload.entityType === "student") {
    if (payload.entityId === undefined) {
      return {
        status: "ERROR",
        errorCode: "MISSING_ENTITY_ID",
        message: "entityId is required when entityType=student.",
      };
    }
    return updateStudentRecord(context, payload, payload.entityId);
  }

  if (payload.entityType === "staff") {
    if (payload.entityId === undefined) {
      return {
        status: "ERROR",
        errorCode: "MISSING_ENTITY_ID",
        message: "entityId is required when entityType=staff.",
      };
    }
    return updateStaffRecord(context, payload, payload.entityId, false);
  }

  const selfStaffId = context.tenantContext.staffId;
  if (!selfStaffId || selfStaffId <= 0) {
    return {
      status: "ERROR",
      errorCode: "NO_SELF_CONTEXT",
      message: "Active tenant context has no associated staffId; cannot resolve self for update.",
    };
  }
  return updateStaffRecord(context, payload, selfStaffId, true);
};

function assertMastraToolContext(
  context: ToolExecutionContext,
): asserts context is MastraToolContext & ToolExecutionContext {
  if (!("tenantContext" in context) || !("getRepo" in context)) {
    throw new Error("Invalid tool execution context: expected MastraToolContext");
  }
}

export const updateRecordTool = createTool({
  id: "update-record",
  description:
    "Update an entity's biographical fields and/or photo. entityType=student|staff (requires entityId) or entityType=self (updates the active staff member).",
  inputSchema: updateRecordSchema,
  execute: async (input: UpdateRecordPayload, context: ToolExecutionContext) => {
    assertMastraToolContext(context);
    return updateRecordLogic(context, input);
  },
  toModelOutput: (output: unknown) => {
    if (!isUpdateRecordResult(output)) {
      return JSON.stringify(output);
    }
    if (output.status === "ERROR") {
      return `Update failed: ${output.message}`;
    }
    return output.message;
  },
});