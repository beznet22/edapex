import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import {
  validateRoleWhitelist,
  type MastraToolContext,
} from "../tenant-context";
import { StaffRepository } from "../../repository/staff.repo";
import { StudentRepository } from "../../repository/student.repo";
import {
  smStaffs,
  smDesignations,
  smHumanDepartments,
  users,
} from "../../db/sms-schema";

const SCHOOL_ID = 1 as const;

const DESIGNATION_SLUG_TO_ID: Record<string, number> = {
  it: 1,
  coordinator: 5,
  class_teacher: 8,
  principal: 3,
  admin: 4,
} as const;

const DESIGNATION_TO_ROLE_ID: Record<number, number> = {
  1: 1, // IT
  8: 2, // class_teacher
  5: 5, // coordinator
  3: 3, // principal
  4: 4, // admin
} as const;

export const enrollStaffSchema = z.object({
  firstName: z.string().min(1).describe("The staff member's first name"),
  lastName: z.string().min(1).describe("The staff member's last name"),
  dateOfBirth: z.string().optional().describe("Date of birth in YYYY-MM-DD format"),
  gender: z.string().min(1).describe("Gender: Male, Female, or Other"),
  email: z.string().email().describe("The staff member's email address"),
  mobile: z.string().min(1).describe("The staff member's mobile phone number"),
  designation: z.string().min(1).describe("Staff designation slug or title, e.g. it, coordinator, class_teacher, principal, admin"),
  department: z.string().min(1).describe("Department name, e.g. Administration, Academics, IT"),
  qualification: z.string().optional().describe("Academic or professional qualification"),
  experience: z.string().optional().describe("Relevant work experience"),
});

export type EnrollStaffPayload = z.infer<typeof enrollStaffSchema>;

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseDateOfBirth(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

async function resolveGenderId(context: MastraToolContext, gender: string): Promise<number | null> {
  const studentRepo = context.getRepo(StudentRepository);
  return studentRepo.resolveGenderId(gender);
}

async function resolveDesignationId(
  staffRepo: StaffRepository,
  designation: string,
): Promise<number | null> {
  const slug = normalizeSlug(designation);
  const mapped = DESIGNATION_SLUG_TO_ID[slug];
  if (mapped) return mapped;

  const [row] = await staffRepo.db
    .select({ id: smDesignations.id })
    .from(smDesignations)
    .where(eq(smDesignations.title, designation))
    .limit(1);

  return row?.id ?? null;
}

async function resolveDepartmentId(
  staffRepo: StaffRepository,
  department: string,
): Promise<number | null> {
  const [row] = await staffRepo.db
    .select({ id: smHumanDepartments.id })
    .from(smHumanDepartments)
    .where(eq(smHumanDepartments.name, department))
    .limit(1);

  return row?.id ?? null;
}

function resolveRoleId(designationId: number): number {
  return DESIGNATION_TO_ROLE_ID[designationId] ?? 2;
}

export const enrollStaffLogic = async (
  context: MastraToolContext,
  params: EnrollStaffPayload,
) => {
  validateRoleWhitelist(context.tenantContext, [1, 5, 8]);

  const staffRepo = context.getRepo(StaffRepository);

  const genderId = await resolveGenderId(context, params.gender);
  if (!genderId) {
    return {
      status: "ERROR" as const,
      errorCode: "GENDER_NOT_FOUND",
      message: `Gender "${params.gender}" not found in system.`,
    };
  }

  const designationId = await resolveDesignationId(staffRepo, params.designation);
  if (!designationId) {
    return {
      status: "ERROR" as const,
      errorCode: "DESIGNATION_NOT_FOUND",
      message: `Designation "${params.designation}" not found in system.`,
    };
  }

  const departmentId = await resolveDepartmentId(staffRepo, params.department);
  if (!departmentId) {
    return {
      status: "ERROR" as const,
      errorCode: "DEPARTMENT_NOT_FOUND",
      message: `Department "${params.department}" not found in system.`,
    };
  }

  const roleId = resolveRoleId(designationId);

  try {
    const result = await staffRepo.createStaff({
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      mobile: params.mobile,
      designationId,
      departmentId,
      roleId,
      genderId,
      qualification: params.qualification,
      experience: params.experience,
      schoolId: SCHOOL_ID,
    });

    const dob = parseDateOfBirth(params.dateOfBirth);
    if (dob && result.id) {
      await staffRepo.db
        .update(smStaffs)
        .set({ dateOfBirth: dob })
        .where(eq(smStaffs.id, result.id));
    }

    return {
      status: "SUCCESS" as const,
      staffId: result.id,
      userId: result.userId,
      email: result.email,
      temporaryPassword: result.password,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    if (errorMessage === "USER_EXISTS") {
      return {
        status: "ERROR" as const,
        errorCode: "USER_EXISTS",
        message: `A user with email "${params.email}" already exists.`,
      };
    }
    return {
      status: "ERROR" as const,
      errorCode: "UNKNOWN",
      message: `Failed to enroll staff: ${errorMessage}`,
    };
  }
};

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

export const enrollStaffTool = createTool({
  id: "enroll-staff",
  description: "Enroll a new staff member into the school with a temporary password.",
  inputSchema: enrollStaffSchema,
  execute: async (inputData: EnrollStaffPayload, context: ToolExecutionContext) => {
    assertMastraToolContext(context);
    return enrollStaffLogic(context, inputData);
  },
  toModelOutput: (output: unknown) => formatToolOutput(output),
});

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
