import { z } from "zod";
import {
  validateWorkspaceLock,
  validateRoleWhitelist,
  WorkspaceMismatchError,
  ForbiddenError,
  type MastraToolContext,
} from "../tenant-context";
import { ResultsRepository } from "../../repository/result.repo";
import { StudentRepository } from "../../repository/student.repo";
import { TimelineRepository } from "../../repository/timeline.repo";

export const academicMarkSchema = z.object({
  type: z.literal("academic"),
  studentId: z.number(),
  subjectId: z.number(),
  score: z.number().min(0).max(100),
  examTypeId: z.number().optional(),
});

export const attendanceSchema = z.object({
  type: z.literal("attendance"),
  studentId: z.number(),
  present: z.number().min(0),
  absent: z.number().min(0),
  daysOpened: z.number().optional(),
});

export const qualitativeRemarkSchema = z.object({
  type: z.literal("qualitative"),
  studentId: z.number(),
  remark: z.string().min(1),
});

export const behavioralRatingSchema = z.object({
  type: z.literal("behavioral"),
  studentId: z.number(),
  trait: z.string(),
  rating: z.number().min(1).max(5),
});

export const manageResultsSchema = z.object({
  type: z.enum(["academic", "attendance", "qualitative", "behavioral"]),
  studentId: z.number(),
  subjectId: z.number().optional(),
  score: z.number().min(0).max(100).optional(),
  examTypeId: z.number().optional(),
  present: z.number().min(0).optional(),
  absent: z.number().min(0).optional(),
  daysOpened: z.number().optional(),
  remark: z.string().min(1).optional(),
  trait: z.string().optional(),
  rating: z.number().min(1).max(5).optional(),
}).superRefine((data, ctx) => {
  if (data.type === "academic") {
    if (data.subjectId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjectId"],
        message: "subjectId is required for academic type",
      });
    }
    if (data.score === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "score is required for academic type",
      });
    }
  } else if (data.type === "attendance") {
    if (data.present === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["present"],
        message: "present is required for attendance type",
      });
    }
    if (data.absent === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["absent"],
        message: "absent is required for attendance type",
      });
    }
  } else if (data.type === "qualitative") {
    if (data.remark === undefined || data.remark.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remark"],
        message: "remark is required for qualitative type",
      });
    }
  } else if (data.type === "behavioral") {
    if (data.trait === undefined || data.trait.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trait"],
        message: "trait is required for behavioral type",
      });
    }
    if (data.rating === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rating"],
        message: "rating is required for behavioral type",
      });
    }
  }
});

export type ManageResultsInput = {
  studentId: number;
} & (
  | { type: "academic"; subjectId: number; score: number; examTypeId?: number }
  | { type: "attendance"; present: number; absent: number; daysOpened?: number }
  | { type: "qualitative"; remark: string }
  | { type: "behavioral"; trait: string; rating: number }
);

export const manageResultsLogic = async (
  context: MastraToolContext,
  input: ManageResultsInput,
): Promise<{ status: string; message?: string; errorCode?: string }> => {
  const { tenantContext, getRepo, audit } = context;

  // 1. Role Whitelist (IT=1, Coordinator=5, Class Teacher=8)
  validateRoleWhitelist(tenantContext, [1, 5, 8]);

  // 2. Resolve student via scoped repository
  const studentRepo = getRepo(StudentRepository);
  const student = await studentRepo.getById(input.studentId);

  if (!student) {
    return { status: "ERROR", errorCode: "STUDENT_NOT_FOUND" };
  }

  // 3. Workspace Lock Check
  validateWorkspaceLock(tenantContext, student.classId, student.sectionId);

  // 4. Branch by type
  const resultRepo = getRepo(ResultsRepository);
  const timelineRepo = getRepo(TimelineRepository);

  const auditDescription = JSON.stringify({
    threadId: audit?.threadId,
    modelId: audit?.modelId,
    action: `manageResults:${input.type}`,
  });

  switch (input.type) {
    case "academic": {
      if (tenantContext.examId === null) {
        return { status: "ERROR", errorCode: "MISSING_EXAM_CONTEXT" };
      }

      await resultRepo.batchUpsertMarkRecords([
        {
          studentId: input.studentId,
          subjectId: input.subjectId,
          totalMarks: input.score,
          examTermId: tenantContext.examId,
          classId: student.classId,
          sectionId: student.sectionId,
          schoolId: tenantContext.schoolId,
          academicId: tenantContext.academicId,
          studentRollNo: 1,
          studentAddmissionNo: 1,
          isAbsent: 0,
        },
      ]);

      await timelineRepo.createTimeline({
        staffStudentId: input.studentId,
        type: "agent:academic",
        schoolId: tenantContext.schoolId,
        academicId: tenantContext.academicId,
        createdBy: tenantContext.userId,
        description: auditDescription,
        threadId: audit?.threadId,
        modelId: audit?.modelId,
      } as any);

      return { status: "SUCCESS", message: `Academic mark updated for Student ${input.studentId}.` };
    }

    case "attendance": {
      await resultRepo.upsertClassAttendance({
        studentId: input.studentId,
        examTypeId: tenantContext.examId,
        daysPresent: input.present,
        daysAbsent: input.absent,
        daysOpened: input.daysOpened,
        schoolId: tenantContext.schoolId,
        academicId: tenantContext.academicId,
      } as any);

      await timelineRepo.createTimeline({
        staffStudentId: input.studentId,
        type: "agent:attendance",
        schoolId: tenantContext.schoolId,
        academicId: tenantContext.academicId,
        createdBy: tenantContext.userId,
        description: auditDescription,
        threadId: audit?.threadId,
        modelId: audit?.modelId,
      } as any);

      return { status: "SUCCESS", message: `Attendance updated for Student ${input.studentId}.` };
    }

    case "qualitative": {
      await resultRepo.upsertTeacherRemark({
        studentId: input.studentId,
        remark: input.remark,
        examTypeId: tenantContext.examId,
        academicId: tenantContext.academicId,
      } as any);

      await timelineRepo.createTimeline({
        staffStudentId: input.studentId,
        type: "agent:qualitative",
        schoolId: tenantContext.schoolId,
        academicId: tenantContext.academicId,
        createdBy: tenantContext.userId,
        description: auditDescription,
        threadId: audit?.threadId,
        modelId: audit?.modelId,
      } as any);

      return { status: "SUCCESS", message: `Remark updated for Student ${input.studentId}.` };
    }

    case "behavioral": {
      await resultRepo.upsertStudentRatings([
        {
          studentId: input.studentId,
          attribute: input.trait,
          rate: input.rating,
          examTypeId: tenantContext.examId,
          academicId: tenantContext.academicId,
        } as any,
      ]);

      await timelineRepo.createTimeline({
        staffStudentId: input.studentId,
        type: "agent:behavioral",
        schoolId: tenantContext.schoolId,
        academicId: tenantContext.academicId,
        createdBy: tenantContext.userId,
        description: auditDescription,
        threadId: audit?.threadId,
        modelId: audit?.modelId,
      } as any);

      return { status: "SUCCESS", message: `Rating updated for Student ${input.studentId}.` };
    }

    default:
      throw new Error("Invalid grading type");
  }
};
