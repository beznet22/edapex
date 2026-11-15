import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { bridgeToolContext } from "../../internal/bridge";
import { parseDateOfBirth, formatToolOutput } from "../../internal/write-tool-utils";
import {
  validateRoleWhitelist,
  type MastraToolContext,
} from "../../../tenant-context";
import { StaffRepository } from "../../../../repository/staff.repo";

export const updateStaffBiodataSchema = z.object({
  staffId: z.number().optional().describe("Numeric ID of the staff member"),
  email: z.string().email().optional().describe("Email address of the staff member"),
  firstName: z.string().optional().describe("New first name"),
  lastName: z.string().optional().describe("New last name"),
  dateOfBirth: z.string().optional().describe("Date of birth in YYYY-MM-DD format"),
  mobile: z.string().optional().describe("New mobile phone number"),
  qualification: z.string().optional().describe("New qualification"),
  experience: z.string().optional().describe("New experience"),
  reason: z.string().describe("Human-readable action summary for user approval."),
});

export type UpdateStaffBiodataPayload = z.infer<typeof updateStaffBiodataSchema>;

async function findStaffByIdOrEmail(
  staffRepo: StaffRepository,
  params: { staffId?: number; email?: string },
): Promise<{ staffId: number; userId: number | null; firstName: string | null; lastName: string | null } | null> {
  if (params.staffId) {
    const staff = await staffRepo.getById(params.staffId);
    if (!staff) return null;
    return {
      staffId: staff.id,
      userId: staff.userId,
      firstName: staff.firstName,
      lastName: staff.lastName,
    };
  }

  if (params.email) {
    const staff = await staffRepo.getStaffByEmail(params.email);
    if (!staff) return null;
    return {
      staffId: staff.id,
      userId: staff.userId,
      firstName: staff.firstName,
      lastName: staff.lastName,
    };
  }

  return null;
}

export const updateStaffBiodataLogic = async (
  context: MastraToolContext,
  params: UpdateStaffBiodataPayload,
) => {
  validateRoleWhitelist(context.tenantContext, [1, 5, 8]);

  const staffRepo = context.getRepo(StaffRepository);

  if (!params.staffId && !params.email) {
    return {
      status: "ERROR" as const,
      errorCode: "MISSING_IDENTIFIER",
      message: "Either staffId or email must be provided to update staff biodata.",
    };
  }

  const staff = await findStaffByIdOrEmail(staffRepo, {
    staffId: params.staffId,
    email: params.email,
  });

  if (!staff) {
    return {
      status: "ERROR" as const,
      errorCode: "STAFF_NOT_FOUND",
      message: `Staff with ${params.staffId ? `ID ${params.staffId}` : `email ${params.email}`} not found.`,
    };
  }

  const staffUpdate: Record<string, unknown> = {};
  if (params.firstName !== undefined) staffUpdate.firstName = params.firstName;
  if (params.lastName !== undefined) staffUpdate.lastName = params.lastName;
  if (params.mobile !== undefined) staffUpdate.mobile = params.mobile;
  if (params.qualification !== undefined) staffUpdate.qualification = params.qualification;
  if (params.experience !== undefined) staffUpdate.experience = params.experience;

  const dob = parseDateOfBirth(params.dateOfBirth);
  if (dob !== undefined) staffUpdate.dateOfBirth = dob;

  const firstName = params.firstName ?? staff.firstName ?? "";
  const lastName = params.lastName ?? staff.lastName ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) {
    staffUpdate.fullName = fullName;
  }

  if (Object.keys(staffUpdate).length === 0) {
    return {
      status: "ERROR" as const,
      errorCode: "NO_CHANGES",
      message: "No valid fields provided for update.",
    };
  }

  try {
    await staffRepo.updateStaff({
      staffId: staff.staffId,
      firstName: params.firstName,
      lastName: params.lastName,
      mobile: params.mobile,
      qualification: params.qualification,
      experience: params.experience,
      dateOfBirth: parseDateOfBirth(params.dateOfBirth),
    });

    return {
      status: "SUCCESS" as const,
      staffId: staff.staffId,
      message: `Staff ${staff.staffId} profile updated successfully.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR" as const,
      errorCode: "UNKNOWN",
      message: `Failed to update staff biodata: ${errorMessage}`,
    };
  }
};

export const updateStaffBiodataTool = createTool({
  id: "update-staff-biodata",
  description: "Update an existing staff member's personal details.",
  inputSchema: updateStaffBiodataSchema,
  requireApproval: true,
  execute: async (inputData: UpdateStaffBiodataPayload, context: ToolExecutionContext) => {
    const ctx = await bridgeToolContext(context);
    return updateStaffBiodataLogic(ctx, inputData);
  },
  toModelOutput: (output: unknown) => formatToolOutput(output),
});
