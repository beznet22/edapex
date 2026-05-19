import { z } from "zod";
import { validateRoleWhitelist, validateWorkspaceLock, type MastraToolContext } from "../tenant-context";
import { StudentRepository } from "../../repository/student.repo";
import { TimelineRepository } from "../../repository/timeline.repo";
import { smBaseSetups, smBaseGroups, smStudentCategories } from "../../db/sms-schema";
import { eq, and, like } from "drizzle-orm";

export const onboardEntitySchema = z.object({
  studentDetails: z.object({
    firstName: z.string(),
    lastName: z.string(),
    gender: z.enum(["Male", "Female"]),
    category: z.string(),
  }),
  guardianDetails: z.object({
    relation: z.enum(["Father", "Mother", "Other"]),
    guardianName: z.string(),
    phone: z.string(),
    email: z.string().email(),
  }),
  enrollmentDetails: z.object({
    classId: z.number().int().positive(),
    sectionId: z.number().int().positive(),
  }),
});

export const patchEntitySchema = z
  .object({
    id: z.number(),
    schoolId: z.number(),
    role: z.string(),
    studentId: z.number().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    dateOfBirth: z.string().optional(),
    genderId: z.number().optional(),
    studentCategoryId: z.number().optional(),
    rollNo: z.number().optional(),
  })
  .omit({ id: true, schoolId: true, role: true });

export type OnboardEntityPayload = z.infer<typeof onboardEntitySchema>;
export type PatchEntityPayload = z.infer<typeof patchEntitySchema>;

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
    const genderGroup = await studentRepo.db
      .select({ id: smBaseGroups.id })
      .from(smBaseGroups)
      .where(and(eq(smBaseGroups.name, "Gender"), eq(smBaseGroups.activeStatus, 1)))
      .limit(1);

    const genderId = genderGroup[0]?.id
      ? (
          await studentRepo.db
            .select({ id: smBaseSetups.id })
            .from(smBaseSetups)
            .where(
              and(
                eq(smBaseSetups.baseGroupId, genderGroup[0].id),
                like(smBaseSetups.baseSetupName, payload.studentDetails.gender),
                eq(smBaseSetups.activeStatus, 1),
              ),
            )
            .limit(1)
        )[0]?.id
      : undefined;

    if (!genderId) {
      return {
        status: "ERROR",
        errorCode: "GENDER_NOT_FOUND",
        message: `Gender "${payload.studentDetails.gender}" not found in system.`,
      };
    }

    const categoryRow = await studentRepo.db
      .select({ id: smStudentCategories.id })
      .from(smStudentCategories)
      .where(like(smStudentCategories.categoryName, payload.studentDetails.category))
      .limit(1);

    const studentCategoryId = categoryRow[0]?.id;

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
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to patch entity: ${errorMessage}`,
    };
  }
};
