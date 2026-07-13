import { z } from "zod";
import { createTool, type ToolExecutionContext } from "@mastra/core/tools";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smStudents, smStudentPromotions, studentRecords } from "$lib/server/db/sms-schema";
import { TimelineRepository } from "../../../../repository/timeline.repo";
import {
  validateRoleWhitelist,
  validateWorkspaceLock,
  WorkspaceMismatchError,
  ForbiddenError,
  type MastraToolContext,
} from "../../../tenant-context";
import { bridgeToolContext } from "../../internal/bridge";

export const demoteStudentSchema = z.object({
  studentId: z.number().describe("Numeric ID of the student to demote/revert promotion"),
  reason: z.string().describe("Human-readable action summary for user approval."),
});

export type DemoteStudentInput = z.infer<typeof demoteStudentSchema>;

type DemotionResult =
  | { status: "SUCCESS"; studentId: number; message: string }
  | { status: "ERROR"; errorCode: string; message: string };

function isDemotionResult(value: unknown): value is DemotionResult {
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
    "studentId" in value && typeof value.studentId === "number" &&
    "message" in value && typeof value.message === "string"
  );
}

export const demoteStudentLogic = async (
  context: MastraToolContext,
  input: DemoteStudentInput,
): Promise<DemotionResult> => {
  const { tenantContext, getRepo } = context;

  validateRoleWhitelist(tenantContext, [1, 5, 8]);

  const db = await getDatabase();
  const timelineRepo = getRepo(TimelineRepository);
  const audit = context.audit;

  try {
    const [student] = await db
      .select({
        id: smStudents.id,
        classId: smStudents.classId,
        sectionId: smStudents.sectionId,
        sessionId: smStudents.sessionId,
        academicId: smStudents.academicId,
        rollNo: smStudents.rollNo,
      })
      .from(smStudents)
      .where(eq(smStudents.id, input.studentId))
      .limit(1);

    if (!student) {
      return {
        status: "ERROR",
        errorCode: "STUDENT_NOT_FOUND",
        message: `Student with ID ${input.studentId} not found.`,
      };
    }

    validateWorkspaceLock(tenantContext, student.classId, student.sectionId);

    const [latestPromotion] = await db
      .select()
      .from(smStudentPromotions)
      .where(eq(smStudentPromotions.studentId, input.studentId))
      .orderBy(desc(smStudentPromotions.id))
      .limit(1);

    if (!latestPromotion) {
      return {
        status: "ERROR",
        errorCode: "NO_PROMOTION_RECORD",
        message: `No promotion record found for student ${input.studentId}.`,
      };
    }

    const currentClassId = latestPromotion.currentClassId;
    const currentSectionId = latestPromotion.currentSectionId;
    const currentSessionId = latestPromotion.currentSessionId;
    const previousClassId = latestPromotion.previousClassId;
    const previousSectionId = latestPromotion.previousSectionId;
    const previousSessionId = latestPromotion.previousSessionId;

    if (
      currentClassId == null ||
      currentSectionId == null ||
      currentSessionId == null ||
      previousClassId == null ||
      previousSectionId == null ||
      previousSessionId == null
    ) {
      return {
        status: "ERROR",
        errorCode: "INVALID_PROMOTION_RECORD",
        message: `The latest promotion record for student ${input.studentId} is missing class/section/session values.`,
      };
    }

    await db.transaction(async (tx) => {
      const [currentRecord] = await tx
        .select({ id: studentRecords.id })
        .from(studentRecords)
        .where(
          and(
            eq(studentRecords.studentId, input.studentId),
            eq(studentRecords.classId, currentClassId),
            eq(studentRecords.sectionId, currentSectionId),
            eq(studentRecords.academicId, currentSessionId),
            eq(studentRecords.isDefault, 1),
          ),
        )
        .limit(1);

      const [previousRecord] = await tx
        .select({ id: studentRecords.id })
        .from(studentRecords)
        .where(
          and(
            eq(studentRecords.studentId, input.studentId),
            eq(studentRecords.classId, previousClassId),
            eq(studentRecords.sectionId, previousSectionId),
            eq(studentRecords.academicId, previousSessionId),
          ),
        )
        .limit(1);

      if (currentRecord) {
        await tx
          .update(studentRecords)
          .set({ isDefault: 0, activeStatus: 0 })
          .where(eq(studentRecords.id, currentRecord.id));
      }

      if (previousRecord) {
        await tx
          .update(studentRecords)
          .set({ isDefault: 1, isPromote: 0, activeStatus: 1 })
          .where(eq(studentRecords.id, previousRecord.id));
      }

      await tx
        .update(smStudents)
        .set({
          classId: previousClassId,
          sectionId: previousSectionId,
          sessionId: previousSessionId,
          academicId: previousSessionId,
          rollNo: latestPromotion.previousRollNumber,
        })
        .where(eq(smStudents.id, input.studentId));

      await tx
        .delete(smStudentPromotions)
        .where(eq(smStudentPromotions.id, latestPromotion.id));
    });

    const auditDescription = JSON.stringify({
      action: "demote",
      type: "demoteStudent",
      studentId: input.studentId,
      previousClassId,
      previousSectionId,
      previousSessionId,
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
      studentId: input.studentId,
      message: `Student ${input.studentId} demoted to previous class/section successfully.`,
    };
  } catch (error) {
    if (error instanceof WorkspaceMismatchError || error instanceof ForbiddenError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      status: "ERROR",
      errorCode: "UNKNOWN",
      message: `Failed to demote student: ${errorMessage}`,
    };
  }
};

function assertMastraToolContext(
  context: ToolExecutionContext,
): asserts context is MastraToolContext & ToolExecutionContext {
  if (!("tenantContext" in context) || !("getRepo" in context)) {
    throw new Error("Invalid tool execution context: expected MastraToolContext");
  }
}

export const demoteStudentTool = createTool({
  id: "demote-student",
  description: "Revert the most recent promotion for a student, restoring their previous class, section, and active student record.",
  inputSchema: demoteStudentSchema,
  requireApproval: true,
  execute: async (input: DemoteStudentInput, context: ToolExecutionContext) => {
    const ctx = await bridgeToolContext(context);
    return demoteStudentLogic(ctx, input);
  },
  toModelOutput: (output: unknown) => {
    if (!isDemotionResult(output)) {
      return "Invalid demotion result.";
    }
    if (output.status === "ERROR") {
      return `Demotion failed: ${output.message}`;
    }
    return output.message ?? `Student ${output.studentId} demoted successfully.`;
  },
});