import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { createAssessmentServiceForRequest } from "../../service/assessment.service";
import { createTenantContext } from "../../mastra/tenant-context";
import { studentRepo } from "$lib/server/repository";

/**
 * Trigger schema for the publish-results workflow.
 * Accepts either an explicit student ID list or a class/section
 * from which all enrolled students are resolved automatically.
 */
const publishTriggerSchema = z.object({
  classId: z.number().int().positive().optional(),
  sectionId: z.number().int().positive().optional(),
  examId: z.number().int().positive(),
  studentIds: z.array(z.number().int().positive()).optional(),
  resend: z.boolean().optional(),
  tenantContext: z.object({
    schoolId: z.number().int().positive(),
  }),
});

/**
 * Workflow state schema for tracking publish progress across steps.
 */
const publishStateSchema = z.object({
  resolvedStudentIds: z.array(z.number()).optional(),
  sentCount: z.number().optional(),
  failedCount: z.number().optional(),
  errors: z.array(z.string()).optional(),
});

/**
 * Step 1 — Resolve Targets
 * Validates prerequisites and resolves the definitive list of student IDs
 * to publish for. When no explicit list is provided, loads all active
 * students from the given class/section combination.
 */
const resolveTargetsStep = createStep({
  id: "resolve-targets",
  inputSchema: publishTriggerSchema,
  outputSchema: z.object({
    studentIds: z.array(z.number().int().positive()),
    examId: z.number().int().positive(),
    resend: z.boolean(),
    errors: z.array(z.string()),
    tenantContext: z.object({ schoolId: z.number().int().positive() }).optional(),
  }),
  stateSchema: publishStateSchema,
  execute: async ({ inputData, setState }) => {
    const { classId, sectionId, examId, studentIds: explicitIds, resend, tenantContext } = inputData;
    const errors: string[] = [];
    let resolvedIds: number[] = [];

    if (explicitIds && explicitIds.length > 0) {
      resolvedIds = explicitIds;
    } else if (classId && sectionId) {
      const students = await studentRepo.getStudentsByClassSection({ classId, sectionId });
      if (students && students.length > 0) {
        resolvedIds = students.map((s) => s.id).filter((id): id is number => id !== null && id !== undefined);
      } else {
        errors.push(`No active students found for class ${classId}, section ${sectionId}`);
      }
    } else {
      errors.push("Either explicit studentIds or both classId and sectionId are required");
    }

    await setState({ resolvedStudentIds: resolvedIds, errors });
    return { studentIds: resolvedIds, examId, resend: resend ?? false, errors, tenantContext };
  },
});

/**
 * Step 2 — Publish Batch
 * Delegates to AssessmentService.publishResults, which generates PDFs,
 * dispatches emails via JobWorker, and writes timeline entries atomically.
 */
const publishBatchStep = createStep({
  id: "publish-batch",
  inputSchema: z.object({
    studentIds: z.array(z.number().int().positive()),
    examId: z.number().int().positive(),
    resend: z.boolean(),
    errors: z.array(z.string()),
    tenantContext: z.object({ schoolId: z.number().int().positive() }).optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    sent: z.number(),
    failed: z.number(),
    errors: z.array(z.string()),
    emailResults: z.array(z.any()),
  }),
  stateSchema: publishStateSchema,
  execute: async ({ inputData, getStepResult, setState }) => {
    const prev = getStepResult<{ studentIds: number[]; examId: number; resend: boolean; errors: string[]; tenantContext?: { schoolId: number } }>(
      "resolve-targets"
    );
    const studentIds = prev?.studentIds ?? inputData.studentIds;
    const examId = prev?.examId ?? inputData.examId;
    const resend = prev?.resend ?? inputData.resend;
    const tenantContext = prev?.tenantContext ?? inputData.tenantContext;

    if (studentIds.length === 0) {
      return { success: false, sent: 0, failed: 0, errors: inputData.errors, emailResults: [] };
    }

    // Slice 10: per-request provider, no global singleton
    const assessment = await createAssessmentServiceForRequest(
      createTenantContext({ schoolId: tenantContext?.schoolId ?? 1, userId: 0 }),
    );
    const result = await assessment.publishResults({ studentIds, examId, resend });

    await setState({
      resolvedStudentIds: studentIds,
      sentCount: result.sent,
      failedCount: result.failed,
      errors: [...(inputData.errors || []), ...result.errors],
    });

    return {
      success: result.success,
      sent: result.sent,
      failed: result.failed,
      errors: [...(inputData.errors || []), ...result.errors],
      emailResults: result.results,
    };
  },
});

/**
 * Step 3 — Report Publish
 * Persists the final publish run outcome and generates a natural language summary.
 */
const reportPublishStep = createStep({
  id: "report-publish",
  inputSchema: z.object({
    success: z.boolean(),
    sent: z.number(),
    failed: z.number(),
    errors: z.array(z.string()),
    emailResults: z.array(z.any()),
  }),
  outputSchema: z.object({
    completed: z.boolean(),
    sentCount: z.number(),
    failedCount: z.number(),
    totalErrors: z.number(),
    summary: z.string().optional()
  }),
  stateSchema: publishStateSchema,
  execute: async ({ inputData, getStepResult, setState }) => {
    const prev = getStepResult<{
      success: boolean;
      sent: number;
      failed: number;
      errors: string[];
    }>("publish-batch");
    const sent = prev?.sent ?? inputData.sent;
    const failed = prev?.failed ?? inputData.failed;
    const errors = prev?.errors ?? inputData.errors;

    await setState({ sentCount: sent, failedCount: failed, errors });

    return {
      completed: true,
      sentCount: sent,
      failedCount: failed,
      totalErrors: errors.length,
      summary: `Successfully sent ${sent} emails. Failed: ${failed}.`
    };
  },
});

export const publishWorkflow = createWorkflow({
  id: "publish-results",
  inputSchema: publishTriggerSchema,
  outputSchema: z.object({
    completed: z.boolean(),
    sentCount: z.number(),
    failedCount: z.number(),
    totalErrors: z.number(),
    summary: z.string().optional()
  }),
  stateSchema: publishStateSchema,
});

publishWorkflow.then(resolveTargetsStep).then(publishBatchStep).then(reportPublishStep).commit();
