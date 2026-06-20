import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import {
  validateRoleWhitelist,
  type MastraToolContext,
} from "../../../tenant-context";
import { StaffRepository } from "../../../../repository/staff.repo";
import { smStaffs, users } from "../../../../db/sms-schema";

export const updateStaffBiodataSchema = z.object({
  staffId: z.number().optional().describe("Numeric ID of the staff member"),
  email: z.string().email().optional().describe("Email address of the staff member"),
  firstName: z.string().optional().describe("New first name"),
  lastName: z.string().optional().describe("New last name"),
  dateOfBirth: z.string().optional().describe("Date of birth in YYYY-MM-DD format"),
  mobile: z.string().optional().describe("New mobile phone number"),
  qualification: z.string().optional().describe("New qualification"),
  experience: z.string().optional().describe("New experience"),
});

export type UpdateStaffBiodataPayload = z.infer<typeof updateStaffBiodataSchema>;

function parseDateOfBirth(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

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
    const [staff] = await staffRepo.db
      .select({
        id: smStaffs.id,
        userId: smStaffs.userId,
        firstName: smStaffs.firstName,
        lastName: smStaffs.lastName,
      })
      .from(smStaffs)
      .where(eq(smStaffs.email, params.email))
      .limit(1);

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
    await staffRepo.db
      .update(smStaffs)
      .set(staffUpdate)
      .where(eq(smStaffs.id, staff.staffId));

    if (staff.userId && (params.firstName !== undefined || params.lastName !== undefined) && fullName) {
      await staffRepo.db
        .update(users)
        .set({ fullName })
        .where(eq(users.id, staff.userId));
    }

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

function assertMastraToolContext(context: ToolExecutionContext): asserts context is MastraToolContext & ToolExecutionContext {
  if (!("tenantContext" in context) || !("getRepo" in context)) {
    throw new Error("Invalid tool execution context: expected MastraToolContext");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasStringStatus(value: Record<string, unknown>): value is Record<string, unknown> & { status: string } {
  return typeof value.status === "string";
}

function formatToolOutput(output: unknown): unknown {
  if (!isRecord(output) || !hasStringStatus(output)) {
    return JSON.stringify(output);
  }

  if (output.status === "SUCCESS") {
    const staffId = output.staffId;
    const userId = output.userId;
    const email = output.email;
    const password = output.temporaryPassword;
    if (typeof staffId === "number" && typeof userId === "number" && typeof email === "string" && typeof password === "string") {
      return `Staff enrolled successfully. Staff ID: ${staffId}, User ID: ${userId}, Email: ${email}, Temporary Password: ${password}`;
    }
    return typeof output.message === "string" ? output.message : "Staff operation completed successfully.";
  }

  return typeof output.message === "string" ? output.message : JSON.stringify(output);
}

export const updateStaffBiodataTool = createTool({
  id: "update-staff-biodata",
  description: "Update an existing staff member's personal details.",
  inputSchema: updateStaffBiodataSchema,
  execute: async (inputData: UpdateStaffBiodataPayload, context: ToolExecutionContext) => {
    assertMastraToolContext(context);
    return updateStaffBiodataLogic(context, inputData);
  },
  toModelOutput: (output: unknown) => formatToolOutput(output),
});
