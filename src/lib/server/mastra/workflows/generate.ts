import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { createAssessmentServiceForRequest } from '../../service/assessment.service';
import { createTenantContext } from '../../mastra/tenant-context';
import { resultOutputSchema } from '$lib/schema/result-output';
import { mastra } from '$lib/server/mastra';

export const generateTriggerSchema = z.object({
  fileIds: z.array(z.string()),
  classId: z.number().int().positive(),
  sectionId: z.number().int().positive(),
  staffId: z.number().int().positive(),
  tenantContext: z.object({
    schoolId: z.number().int().positive(),
    userId: z.number().int().positive(),
  }),
});

export const generateStateSchema = z.object({
  processedCount: z.number().default(0),
  succeededCount: z.number().default(0),
  failedCount: z.number().default(0),
  errors: z.array(z.string()).default([]),
});

const downloadMarkdownStep = createStep({
  id: 'download-markdown',
  inputSchema: z.object({ fileId: z.string(), tenantContext: z.any() }),
  outputSchema: z.object({ fileId: z.string(), markdown: z.string() }),
  execute: async ({ inputData }) => {
    const { fileId, tenantContext } = inputData;
    const markdown = await mistralOcrService.getMarkdownByFileId(tenantContext, fileId);
    return { fileId, markdown };
  },
});

const openArtifactStep = createStep({
  id: 'open-artifact',
  inputSchema: z.object({ fileId: z.string(), markdown: z.string(), tenantContext: z.any() }),
  outputSchema: z.object({ fileId: z.string(), finalMarkdown: z.string(), tenantContext: z.any() }),
  resumeSchema: z.object({
    approved: z.boolean(),
    correctedMarkdown: z.string().optional(),
  }),
  suspendSchema: z.object({
    fileId: z.string(),
    markdown: z.string(),
    reason: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, suspendData, bail }) => {
    const { approved, correctedMarkdown } = resumeData ?? {};

    if (approved === false) {
      return bail({ reason: `File ${inputData.fileId} skipped by user` });
    }

    if (!approved) {
      return await suspend({
        fileId: inputData.fileId,
        markdown: inputData.markdown,
        reason: 'Verify OCR accuracy and add any missing student details',
      });
    }

    return {
      fileId: inputData.fileId,
      finalMarkdown: correctedMarkdown ?? suspendData?.markdown ?? inputData.markdown,
      tenantContext: inputData.tenantContext
    };
  },
});

const structuredOutputStep = createStep({
  id: 'structured-output',
  inputSchema: z.object({ fileId: z.string(), finalMarkdown: z.string(), tenantContext: z.any() }),
  outputSchema: z.object({ fileId: z.string(), studentId: z.number(), resultOutput: resultOutputSchema, tenantContext: z.any() }),
  execute: async ({ inputData }) => {
    const { fileId, finalMarkdown, tenantContext } = inputData;

    const agent = mastra.getAgent('result-mapper');
    if (!agent) {
      throw new Error('Agent result-mapper not found');
    }

    // Call agent to map markdown to structured data
    const response = await agent.generate(
      `Map this markdown to structured ResultOutput format in JSON:\n\n${finalMarkdown}`
    );

    const parsed = resultOutputSchema.safeParse(response.object || JSON.parse(response.text));
    if (!parsed.success) {
      throw new Error('Failed to generate structured output');
    }

    const resultOutput = parsed.data;
    const studentId = resultOutput.student.id; 
    if (!studentId) {
      throw new Error('Mapped output missing studentId');
    }

    return { fileId, studentId, resultOutput, tenantContext };
  },
});

const constructPdfCardStep = createStep({
  id: 'construct-pdf-card',
  inputSchema: z.object({ fileId: z.string(), studentId: z.number(), resultOutput: resultOutputSchema, tenantContext: z.any() }),
  outputSchema: z.object({ fileId: z.string(), success: z.boolean(), token: z.string().optional() }),
  execute: async ({ inputData }) => {
    const { fileId, studentId, resultOutput, tenantContext } = inputData;
    
    let examId = 1;
    if (resultOutput.student && 'examId' in resultOutput.student) {
      examId = (resultOutput.student as any).examId;
    }
    const staffId = tenantContext?.userId || 1;

    // Commit to DB (Slice 10: per-request provider, no global singleton)
    const assessment = await createAssessmentServiceForRequest(
      createTenantContext({
        schoolId: tenantContext?.schoolId ?? 1,
        userId: staffId,
      }),
    );
    await assessment.upsertStudentResult(resultOutput as any, staffId);

    // Construct base64url token
    const tokenPayload = JSON.stringify({ studentId, examId });
    const token = Buffer.from(tokenPayload).toString('base64url');

    return { fileId, success: true, token };
  },
});

const processFileWorkflow = createWorkflow({
  id: 'process-single-file',
  inputSchema: z.object({ fileId: z.string(), tenantContext: z.any() }),
  outputSchema: z.object({ fileId: z.string(), success: z.boolean(), token: z.string().optional() }),
  stateSchema: generateStateSchema,
});
processFileWorkflow
  .then(downloadMarkdownStep as any)
  .then(openArtifactStep as any)
  .then(structuredOutputStep as any)
  .then(constructPdfCardStep as any)
  .commit();

const reportStep = createStep({
  id: 'report',
  inputSchema: z.array(z.object({ fileId: z.string(), success: z.boolean(), token: z.string().optional() })),
  outputSchema: z.object({ status: z.string(), succeeded: z.number(), failed: z.number(), total: z.number() }),
  execute: async ({ inputData }) => {
    const total = inputData.length;
    const succeeded = inputData.filter(d => d.success).length;
    const failed = total - succeeded;
    
    return {
      status: failed === 0 ? 'complete' : 'partial-failure',
      succeeded,
      failed,
      total
    };
  }
});

export const generateWorkflow = createWorkflow({
  id: 'generate-results',
  inputSchema: generateTriggerSchema,
  outputSchema: z.object({ status: z.string(), succeeded: z.number(), failed: z.number(), total: z.number() }),
  stateSchema: generateStateSchema,
});

const mapFilesStep = createStep({
  id: 'map-files',
  inputSchema: generateTriggerSchema,
  outputSchema: z.array(z.object({ fileId: z.string(), tenantContext: z.any() })),
  execute: async ({ inputData }) => {
    return inputData.fileIds.map(id => ({ fileId: id, tenantContext: inputData.tenantContext }));
  }
});

generateWorkflow
  .then(mapFilesStep as any)
  .then(processFileWorkflow as any)
  .then(reportStep as any)
  .commit();
