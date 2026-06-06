import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { mastra } from '$lib/server/mastra';

export const extractionTriggerSchema = z.object({
  fileReferences: z.array(z.object({
    fileId: z.string().optional(),
    key: z.string().optional(),
    url: z.string().optional(),
  })).optional(),
  files: z.array(z.object({
    fileId: z.string(),
    blob: z.any(), // Blob
    mediaType: z.string(),
    filename: z.string().optional()
  })).optional(),
  mode: z.enum(['batch', 'ondemand']).default('ondemand'),
  tenantContext: z.object({
    schoolId: z.number().int().positive(),
    userId: z.number().int().positive(),
  }).optional(),
});

export const extractionStateSchema = z.object({
  extractedResults: z.array(z.object({
    fileId: z.string(),
    markdown: z.string()
  })).default([]),
  jobId: z.string().optional(),
  errors: z.array(z.string()).default([]),
});

// ---------- MODE 2: On-Demand Extraction (Nested loop) ----------

const processDocumentStep = createStep({
  id: 'process-document',
  inputSchema: z.object({ fileId: z.string(), blob: z.any(), filename: z.string().optional() }),
  outputSchema: z.object({ fileId: z.string(), markdown: z.string(), filename: z.string().optional() }),
  execute: async ({ inputData }) => {
    // Artificial delay is handled by MistralOcrService
    const ocrResponse = await mistralOcrService.processDocument(inputData.blob, inputData.filename || inputData.fileId);
    const markdown = (ocrResponse as any).pages?.map((p: any) => p.markdown).join('\n\n') || '';
    return { fileId: inputData.fileId, markdown, filename: inputData.filename };
  }
});

const openArtifactStep = createStep({
  id: 'open-artifact',
  inputSchema: z.object({ fileId: z.string(), markdown: z.string(), filename: z.string().optional() }),
  outputSchema: z.object({ fileId: z.string(), finalMarkdown: z.string(), filename: z.string().optional() }),
  resumeSchema: z.object({
    approved: z.boolean(),
    correctedMarkdown: z.string().optional(),
  }),
  suspendSchema: z.object({
    fileId: z.string(),
    markdown: z.string(),
    reason: z.string(),
    filename: z.string().optional()
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
        reason: 'Verify OCR accuracy',
        filename: inputData.filename
      });
    }

    return {
      fileId: inputData.fileId,
      finalMarkdown: correctedMarkdown ?? suspendData?.markdown ?? inputData.markdown,
      filename: inputData.filename
    };
  }
});

const storeResultStep = createStep({
  id: 'store-result',
  inputSchema: z.object({ fileId: z.string(), finalMarkdown: z.string(), filename: z.string().optional() }),
  outputSchema: z.object({ fileId: z.string(), stored: z.boolean() }),
  execute: async ({ inputData }) => {
    // Mutate state to store final markdown
    // In Mastra, state is read-only in context, so we might need setState if available,
    // or we just rely on the step outputs being part of the run snapshot.
    return { fileId: inputData.fileId, stored: true };
  }
});

const processFileWorkflow = createWorkflow({
  id: 'extract-single-file',
  inputSchema: z.object({ fileId: z.string(), blob: z.any(), filename: z.string().optional() }),
  outputSchema: z.object({ fileId: z.string(), stored: z.boolean() })
});

processFileWorkflow
  .then(processDocumentStep as any)
  .then(openArtifactStep as any)
  .then(storeResultStep as any)
  .commit();


// ---------- Main Extraction Workflow ----------

const resolveFilesStep = createStep({
  id: 'resolve-files',
  inputSchema: extractionTriggerSchema,
  outputSchema: z.array(z.object({ fileId: z.string(), blob: z.any(), filename: z.string().optional() })),
  execute: async ({ inputData }) => {
    const files = inputData.files || [];
    // If fileReferences are passed instead of direct files, we would resolve them here
    return files;
  }
});

const reportExtractionStep = createStep({
  id: 'report-extraction',
  inputSchema: z.array(z.object({ fileId: z.string(), stored: z.boolean() })),
  outputSchema: z.object({ status: z.string(), succeeded: z.number(), failed: z.number(), total: z.number() }),
  execute: async ({ inputData }) => {
    const total = inputData.length;
    const succeeded = inputData.filter(d => d.stored).length;
    const failed = total - succeeded;
    return { status: failed === 0 ? 'complete' : 'partial-failure', succeeded, failed, total };
  }
});

export const extractionWorkflow = createWorkflow({
  id: 'extractionWorkflow',
  inputSchema: extractionTriggerSchema,
  outputSchema: z.object({ status: z.string(), succeeded: z.number(), failed: z.number(), total: z.number() }),
  stateSchema: extractionStateSchema,
});

extractionWorkflow
  .then(resolveFilesStep as any)
  .then(processFileWorkflow as any)
  .then(reportExtractionStep as any)
  .commit();
