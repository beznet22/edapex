import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { marksheetSchema } from '$lib/schema/marksheet';
import { createAssessmentServiceForRequest } from '../../service/assessment.service';
import { createTenantContext } from '../../mastra/tenant-context';
import { applyGradingBusinessLogic, validateAttendance } from '../../service/assessment-ocr.service';
import { mastra } from '$lib/server/mastra';

const validationTriggerSchema = z.object({
  extractedResults: z.array(z.object({
    fileId: z.string(),
    studentId: z.number().int().positive().optional(),
    markdown: z.string(),
  })),
  staffId: z.number().int().positive(),
  examId: z.number().int().positive(),
  classId: z.number().int().positive(),
  sectionId: z.number().int().positive(),
  tenantContext: z.object({
    schoolId: z.number().int().positive(),
  }),
});

const validationStateSchema = z.object({
  validatedResults: z.array(z.any()).default([]),
  invalidResults: z.array(z.any()).default([]),
  errors: z.array(z.string()).default([]),
});

const resolveMarkdownStep = createStep({
  id: 'resolve-markdown',
  inputSchema: z.object({ fileId: z.string(), studentId: z.number().optional(), markdown: z.string() }),
  outputSchema: z.object({ fileId: z.string(), studentId: z.number().optional(), markdown: z.string() }),
  execute: async ({ inputData }) => {
    return inputData;
  }
});

const structuredOutputStep = createStep({
  id: 'structured-output',
  inputSchema: z.object({ fileId: z.string(), studentId: z.number().optional(), markdown: z.string() }),
  outputSchema: z.object({ fileId: z.string(), studentId: z.number().optional(), resultOutput: marksheetSchema.optional(), validationErrors: z.array(z.string()).optional() }),
  execute: async ({ inputData }) => {
    const agent = mastra.getAgent('result-mapper');
    if (!agent) throw new Error('Agent result-mapper not found');

    const response = await (agent as any).generate(
      `Map this markdown to structured ResultOutput format:\n\n${inputData.markdown}`,
      { output: marksheetSchema }
    );

    const parsed = await marksheetSchema.safeParseAsync(response.object);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      return { fileId: inputData.fileId, studentId: inputData.studentId, validationErrors: errors };
    }

    return { fileId: inputData.fileId, studentId: inputData.studentId, resultOutput: parsed.data };
  }
});

const handleValidationStep = createStep({
  id: 'handle-validation',
  inputSchema: z.object({ fileId: z.string(), studentId: z.number().optional(), resultOutput: marksheetSchema.optional(), validationErrors: z.array(z.string()).optional(), markdown: z.string().optional() }),
  outputSchema: z.object({ fileId: z.string(), success: z.boolean(), token: z.string().optional(), errors: z.array(z.string()).optional() }),
  resumeSchema: z.object({
    approved: z.boolean(),
    correctedMarkdown: z.string().optional()
  }),
  suspendSchema: z.object({
    fileId: z.string(),
    markdown: z.string(),
    errors: z.array(z.string()),
    reason: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, bail, context }: any) => {
    const { approved, correctedMarkdown } = resumeData ?? {};
    
    // If validation failed originally or user sent corrections
    if (inputData.validationErrors && inputData.validationErrors.length > 0 && !approved) {
      return await suspend({
        fileId: inputData.fileId,
        markdown: inputData.markdown || '',
        errors: inputData.validationErrors,
        reason: 'Validation failed. Please correct the markdown.'
      });
    }

    if (approved === false) {
      return bail({ reason: `File ${inputData.fileId} skipped by user` });
    }

    const output = inputData.resultOutput;
    if (!output) {
      return bail({ reason: `Missing result output` });
    }

    // Apply business logic
    applyGradingBusinessLogic(output, 'NURSERY');
    validateAttendance(output);

    // Commit to DB (Slice 10: per-request provider)
    const ctx = context?.workflowState?.triggerData ?? {};
    const staffId = ctx.staffId ?? 1;
    const examId = ctx.examId ?? 1;
    const schoolId = ctx.tenantContext?.schoolId ?? 1;
    const assessment = await createAssessmentServiceForRequest(
      createTenantContext({
        schoolId,
        userId: staffId,
      }),
    );
    await assessment.upsertStudentResult(output, examId);

    // Construct PDF token
    const tokenPayload = JSON.stringify({ studentId: (output as any).studentId, examId });
    const token = Buffer.from(tokenPayload).toString('base64url');

    return { fileId: inputData.fileId, success: true, token };
  }
});

const processValidationWorkflow = createWorkflow({
  id: 'validate-single-file',
  inputSchema: z.object({ fileId: z.string(), studentId: z.number().optional(), markdown: z.string() }),
  outputSchema: z.object({ fileId: z.string(), success: z.boolean(), token: z.string().optional(), errors: z.array(z.string()).optional() })
});

processValidationWorkflow
  .then(resolveMarkdownStep as any)
  .then(structuredOutputStep as any)
  .then(handleValidationStep as any)
  .commit();

const reportValidationStep = createStep({
  id: 'report-validation',
  inputSchema: z.array(z.object({ fileId: z.string(), success: z.boolean(), token: z.string().optional(), errors: z.array(z.string()).optional() })),
  outputSchema: z.object({ status: z.string(), succeeded: z.number(), failed: z.number(), total: z.number() }),
  execute: async ({ inputData }) => {
    const total = inputData.length;
    const succeeded = inputData.filter(d => d.success).length;
    const failed = total - succeeded;
    return { status: failed === 0 ? 'complete' : 'partial-failure', succeeded, failed, total };
  }
});

export const validationWorkflow = createWorkflow({
  id: 'validationWorkflow',
  inputSchema: validationTriggerSchema,
  outputSchema: z.object({ status: z.string(), succeeded: z.number(), failed: z.number(), total: z.number() }),
  stateSchema: validationStateSchema,
});

const mapValidationFilesStep = createStep({
  id: 'map-validation-files',
  inputSchema: validationTriggerSchema,
  outputSchema: z.array(z.object({ fileId: z.string(), studentId: z.number().optional(), markdown: z.string() })),
  execute: async ({ inputData }) => inputData.extractedResults
});

validationWorkflow
  .then(mapValidationFilesStep as any)
  .then(processValidationWorkflow as any)
  .then(reportValidationStep as any)
  .commit();
