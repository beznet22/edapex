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
import { StudentRepository } from "../../../../repository/student.repo";

const DESIGNATION_TO_ROLE_ID: Record<number, number> = {
  1: 1,
  8: 2,
  5: 5,
  3: 3,
  4: 4,
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
  reason: z.string().describe("Human-readable action summary for user approval."),
});

export type EnrollStaffPayload = z.infer<typeof enrollStaffSchema>;

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

async function resolveGenderId(context: MastraToolContext, gender: string): Promise<number | null> {
  const studentRepo = context.getRepo(StudentRepository);
  return studentRepo.resolveGenderId(gender);
}

async function resolveDesignationId(
  staffRepo: StaffRepository,
  designation: string,
): Promise<number | null> {
  return staffRepo.resolveDesignationId(designation);
}

async function resolveDepartmentId(
  staffRepo: StaffRepository,
  department: string,
): Promise<number | null> {
  return staffRepo.resolveDepartmentId(department);
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
      dateOfBirth: parseDateOfBirth(params.dateOfBirth),
      schoolId: context.tenantContext.schoolId,
    });

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

export const enrollStaffTool = createTool({
  id: "enroll-staff",
  description: "Enroll a new staff member into the school with a temporary password.",
  inputSchema: enrollStaffSchema,
  requireApproval: true,
  execute: async (inputData: EnrollStaffPayload, context: ToolExecutionContext) => {
    const ctx = await bridgeToolContext(context);
    return enrollStaffLogic(ctx, inputData);
  },
  toModelOutput: (output: unknown) => formatToolOutput(output),
});
