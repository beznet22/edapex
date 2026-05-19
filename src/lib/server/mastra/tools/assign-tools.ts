import { z } from "zod";
import { validateWorkspaceLock, validateRoleWhitelist, type MastraToolContext } from "../tenant-context";
import { StudentRepository } from "../../repository/student.repo";
import { TimelineRepository } from "../../repository/timeline.repo";

export const assignEntitySchema = z.object({
  studentId: z.number(),
  targetClassId: z.number(),
  targetSectionId: z.number(),
  academicYearId: z.number().optional(),
  reason: z.string().optional(),
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to assign student: ${errorMessage}`,
    };
  }
};
