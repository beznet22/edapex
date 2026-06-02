import { z } from "zod";
import {
  validateRoleWhitelist,
  validateWorkspaceLock,
  WorkspaceMismatchError,
  ForbiddenError,
  type MastraToolContext,
} from "../tenant-context";
import { StudentRepository } from "../../repository/student.repo";
import { TimelineRepository } from "../../repository/timeline.repo";

export const onboardEntitySchema = z.object({
  studentDetails: z.object({
    firstName: z.string().describe("The student's first name"),
    lastName: z.string().describe("The student's last name"),
    gender: z.enum(["Male", "Female"]).describe("The student's gender"),
    category: z.string().describe("Student category (e.g., DAYCARE, LOWER BASIC)"),
  }).describe("Core student biographical information"),
  guardianDetails: z.object({
    relation: z.enum(["Father", "Mother", "Other"]).describe("Guardian's relationship to the student"),
    guardianName: z.string().describe("Full name of the primary guardian"),
    phone: z.string().describe("Guardian's primary phone number"),
    email: z.string().email().describe("Guardian's email address"),
  }).describe("Primary guardian contact details"),
  enrollmentDetails: z.object({
    classId: z.number().int().positive().describe("Numeric ID of the class to enroll in"),
    sectionId: z.number().int().positive().describe("Numeric ID of the section to enroll in"),
  }).describe("Target enrollment destination for the new student"),
});



export type OnboardEntityPayload = z.infer<typeof onboardEntitySchema>;


export const getRegistrationOptions = async (context?: MastraToolContext) => {
  if (!context) {
    return {
      classes: [],
      sections: [],
      categories: [],
      genders: ["Male", "Female"],
      relations: ["Father", "Mother", "Other"],
    };
  }

  const studentRepo = context.getRepo(StudentRepository);
  return await studentRepo.getStudentRegistrationOptions();
};

export const onboardEntityLogic = async (
  context: MastraToolContext,
  payload: OnboardEntityPayload,
  options: { simulateUserExists?: boolean } = {},
) => {
  if (options.simulateUserExists) {
    return {
      status: "ERROR",
      errorCode: "USER_EXISTS",
      message:
        "A user with this email or identity already exists. Did you mean to /update their profile instead?",
      suggestion: "/update",
    };
  }

  const { tenantContext, getRepo, audit } = context;

  validateRoleWhitelist(tenantContext, [1, 5, 8]);
  validateWorkspaceLock(
    tenantContext,
    payload.enrollmentDetails.classId,
    payload.enrollmentDetails.sectionId,
  );

  const studentRepo = getRepo(StudentRepository);
  const timelineRepo = getRepo(TimelineRepository);

  try {
    const genderId = await studentRepo.resolveGenderId(payload.studentDetails.gender);

    if (!genderId) {
      return {
        status: "ERROR",
        errorCode: "GENDER_NOT_FOUND",
        message: `Gender "${payload.studentDetails.gender}" not found in system.`,
      };
    }

    const studentCategoryId = await studentRepo.resolveStudentCategoryId(payload.studentDetails.category);

    if (!studentCategoryId) {
      return {
        status: "ERROR",
        errorCode: "CATEGORY_NOT_FOUND",
        message: `Student category "${payload.studentDetails.category}" not found in system.`,
      };
    }

    const createInput = {
      firstName: payload.studentDetails.firstName,
      lastName: payload.studentDetails.lastName,
      classId: payload.enrollmentDetails.classId,
      sectionId: payload.enrollmentDetails.sectionId,
      genderId,
      studentCategoryId,
      schoolId: tenantContext.schoolId,
      guardianRelation: payload.guardianDetails.relation.toLowerCase() as "father" | "mother" | "other",
      guardiansName: payload.guardianDetails.guardianName,
      guardiansMobile: payload.guardianDetails.phone,
      guardiansEmail: payload.guardianDetails.email,
    };

    const result = await studentRepo.creatStudentIfNotExists(createInput);

    const auditDescription = JSON.stringify({
      action: "onboard",
      type: "onboardEntity",
      studentId: (result as any).id,
      threadId: audit?.threadId,
      modelId: audit?.modelId,
    });

    await timelineRepo.createTimeline({
      staffStudentId: (result as any).id,
      type: "behavioral",
      description: auditDescription,
      schoolId: tenantContext.schoolId,
      academicId: tenantContext.academicId ?? 0,
      createdBy: tenantContext.userId,
    });

    return {
      status: "SUCCESS",
      studentId: (result as any).id,
      admissionNumber: (result as any).admissionNo,
      message: "Student registered successfully.",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    if (errorMessage === "USER_EXISTS") {
      return {
        status: "ERROR",
        errorCode: "USER_EXISTS",
        message:
          "A user with this email or identity already exists. Did you mean to /update their profile instead?",
        suggestion: "/update",
      };
    }
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to onboard student: ${errorMessage}`,
    };
  }
};




export const assignEntitySchema = z.object({
  studentId: z.number().describe("The ID of the student to assign or transfer"),
  targetClassId: z.number().describe("Numeric ID of the destination class"),
  targetSectionId: z.number().describe("Numeric ID of the destination section"),
  academicYearId: z.number().optional().describe("Numeric ID of the academic year (defaults to active term if omitted)"),
  reason: z.string().optional().describe("Optional reason for the transfer/assignment for audit logs"),
});
export type AssignEntityInput = z.infer<typeof assignEntitySchema>;

export const assignEntityLogic = async (context: MastraToolContext, input: AssignEntityInput) => {
  const { tenantContext, getRepo, audit } = context;

  validateRoleWhitelist(tenantContext, [1, 5, 8]);
  validateWorkspaceLock(tenantContext, input.targetClassId, input.targetSectionId);

  const studentRepo = getRepo(StudentRepository);
  const timelineRepo = getRepo(TimelineRepository);

  try {
    const student = await studentRepo.getById(input.studentId);
    if (!student) {
      return {
        status: "ERROR",
        errorCode: "STUDENT_NOT_FOUND",
        message: `Student with ID ${input.studentId} not found.`,
      };
    }

    // B9: source-class workspace lock. The destination check above validates
    // that the caller is allowed to write to the target class; this validates
    // that they are also allowed to *read* the student's current class.
    // A Class Teacher locked to class 10 must not be able to fish students
    // out of class 99 simply because the destination is their own class.
    // Re-thrown rather than caught so the caller can distinguish
    // permission errors from DB errors.
    validateWorkspaceLock(tenantContext, student.classId, student.sectionId);

    await studentRepo.assignClassSection({
      studentId: input.studentId,
      classId: input.targetClassId,
      sectionId: input.targetSectionId,
    });

    const auditDescription = JSON.stringify({
      action: "assign",
      type: "assignEntity",
      studentId: input.studentId,
      classId: input.targetClassId,
      sectionId: input.targetSectionId,
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
      message: `Student ${student.fullName ?? input.studentId} successfully assigned to Class ${input.targetClassId}, Section ${input.targetSectionId}.`,
    };
  } catch (error) {
    // Re-throw validation errors so callers can distinguish permission failures
    // from DB failures. The try/catch is for the assignClassSection path only.
    if (error instanceof WorkspaceMismatchError || error instanceof ForbiddenError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to assign student: ${errorMessage}`,
    };
  }
};
