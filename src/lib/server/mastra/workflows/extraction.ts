import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { Agent } from "@mastra/core/agent";
import { ModelRouter } from "../router";
import { createMastraDb } from "../db";
import {
  OCR_SYSTEM_PROMPT,
  MAPPER_SYSTEM_PROMPT,
  legacyExtractPrompt,
} from "../../prompts/extract";
import { resultInputSchema } from "$lib/schema/result-input";
import { assessment } from "../../service/assessment.service";
import { formatMappingDataToIndex } from "../../helpers/extract-helper";

/**
 * Trigger schema for the document-extraction workflow.
 * Receives uploaded file blobs, user context, and class/section mapping targets.
 */
const extractionTriggerSchema = z.object({
  files: z
    .array(
      z.object({
        fileId: z.string(),
        blob: z.instanceof(Blob),
        mediaType: z.string(),
      }),
    )
    .min(1, "At least one file is required"),
  userId: z.number().int().positive(),
  teacherId: z.number().int().positive(),
  classId: z.number().int().positive(),
  sectionId: z.number().int().positive(),
  tenantContext: z.object({
    schoolId: z.number().int().positive(),
  }),
});

/**
 * Workflow state schema for persisting intermediate extraction results
 * across step boundaries and suspend/resume cycles.
 */
const extractionStateSchema = z.object({
  mappingIndex: z.string().optional(),
  extractedResults: z.array(z.any()).optional(),
  errors: z.array(z.string()).optional(),
});

/**
 * Step 1 — OCR Extraction (Self-Contained)
 * Resolves models via AgentRouter and creates inline agents for:
 *   - Two-pass extraction: OCR transcription → structured mapping
 *   - Fallback: single-pass vision extraction
 */
const extractStep = createStep({
  id: "extract-files",
  inputSchema: extractionTriggerSchema,
  outputSchema: z.object({
    extractedData: z.array(
      z.object({
        fileId: z.string(),
        rawText: z.string(),
        structuredData: z.any(),
        isFallback: z.boolean(),
      }),
    ),
    errors: z.array(z.string()),
    mappingIndex: z.string(),
  }),
  stateSchema: extractionStateSchema,
  execute: async ({ inputData, setState }) => {
    const { files, userId, teacherId, classId, sectionId } = inputData;
    const errors: string[] = [];
    const extractedData: Array<{
      fileId: string;
      rawText: string;
      structuredData: any;
      isFallback: boolean;
    }> = [];

    // Load environment and initialize router
    const { env } = await import("$env/dynamic/private");
    const db = createMastraDb();
    const router = new ModelRouter(db, userId);
    const encryptionKey = env.TOKEN_ENCRYPTION_KEY || "edapex-default-encryption-key-32ch";
    const envKeys = env as Record<string, string | undefined>;

    // Resolve models inline via ModelRouter
    const ocrModel = await router.resolveMastraModel("ocr", envKeys, encryptionKey);
    const mapperModel = await router.resolveMastraModel("chat", envKeys, encryptionKey);
    const fallbackModel = await router.resolveMastraModel("vision", envKeys, encryptionKey);

    // Create inline Agent instances
    const ocrAgent = new Agent({
      id: "ocr-agent",
      name: "OCR Transcription Agent",
      instructions: OCR_SYSTEM_PROMPT,
      model: ocrModel,
    });

    const mapperAgent = new Agent({
      id: "mapper-agent",
      name: "Structured Mapping Agent",
      instructions: MAPPER_SYSTEM_PROMPT,
      model: mapperModel,
    });

    const fallbackAgent = new Agent({
      id: "fallback-vision-agent",
      name: "Fallback Vision Agent",
      instructions: legacyExtractPrompt,
      model: fallbackModel,
    });

    // Load mapping context for the target class/section
    const mappingData = await assessment.getMappingData(teacherId, classId, sectionId);
    const mappingIndex = formatMappingDataToIndex(mappingData);

    // Process each file with two-pass extraction + fallback
    for (const file of files) {
      try {
        const result = await runTwoPassForFile(
          file,
          mappingIndex,
          ocrAgent,
          mapperAgent,
          fallbackAgent,
        );
        extractedData.push(result);
      } catch (error: any) {
        errors.push(`Error processing ${file.fileId}: ${error.message || String(error)}`);
      }
    }

    await setState({ mappingIndex, extractedResults: extractedData, errors });
    return { extractedData, errors, mappingIndex };
  },
});

/**
 * Runs two-pass extraction for a single file:
 * Pass 1: OCR transcription
 * Pass 2: Structured mapping
 * Fallback: Single-pass vision extraction if either pass fails
 */
async function runTwoPassForFile(
  file: { fileId: string; blob: Blob; mediaType: string },
  mappingIndex: string,
  ocrAgent: InstanceType<typeof Agent>,
  mapperAgent: InstanceType<typeof Agent>,
  fallbackAgent: InstanceType<typeof Agent>,
): Promise<{ fileId: string; rawText: string; structuredData: any; isFallback: boolean }> {
  let ocrText: string | undefined;

  // --- Pass 1: OCR Transcription ---
  try {
    const ocrResponse = await ocrAgent.generate([
      {
        role: "user",
        content: [
          {
            type: "file",
            data: await file.blob.arrayBuffer(),
            mediaType: file.mediaType,
          },
        ],
      },
    ]);
    ocrText = ocrResponse.text;
  } catch (error) {
    console.warn(`OCR Pass 1 failed for ${file.fileId}, attempting single-pass fallback`, error);
    return await runFallbackForFile(file, mappingIndex, fallbackAgent);
  }

  // --- Pass 2: Structured Mapping ---
  try {
    const mapperResponse = await mapperAgent.generate(
      `OCR Transcription:\n${ocrText}\n\nMapping Data (Look up IDs here):\n${mappingIndex}`,
      {
        structuredOutput: {
          schema: resultInputSchema,
        },
      },
    );

    return {
      fileId: file.fileId,
      rawText: ocrText,
      structuredData: mapperResponse.object,
      isFallback: false,
    };
  } catch (error) {
    console.warn(`Mapping Pass 2 failed for ${file.fileId}, attempting single-pass fallback`, error);
    return await runFallbackForFile(file, mappingIndex, fallbackAgent);
  }
}

/**
 * Single-pass fallback using a vision model that extracts structured data
 * directly from the document image.
 */
async function runFallbackForFile(
  file: { fileId: string; blob: Blob; mediaType: string },
  mappingIndex: string,
  fallbackAgent: InstanceType<typeof Agent>,
): Promise<{ fileId: string; rawText: string; structuredData: any; isFallback: boolean }> {
  const response = await fallbackAgent.generate(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract data using this mapping context:\n${mappingIndex}`,
          },
          {
            type: "file",
            data: await file.blob.arrayBuffer(),
            mediaType: file.mediaType,
          },
        ],
      },
    ],
    {
      structuredOutput: {
        schema: resultInputSchema,
      },
    },
  );

  return {
    fileId: file.fileId,
    rawText: "",
    structuredData: response.object,
    isFallback: true,
  };
}

/**
 * Step 2 — Structure Results
 * Normalises the extraction outputs into a uniform shape ready for
 * downstream validation, preserving raw text and fallback flags for audit.
 */
const structureStep = createStep({
  id: "structure-data",
  inputSchema: z.object({
    extractedData: z.array(z.any()),
    errors: z.array(z.string()),
    mappingIndex: z.string(),
  }),
  outputSchema: z.object({
    structuredResults: z.array(
      z.object({
        fileId: z.string(),
        resultInput: z.any(),
        rawText: z.string(),
        isFallback: z.boolean(),
      }),
    ),
    errors: z.array(z.string()),
  }),
  stateSchema: extractionStateSchema,
  execute: async ({ inputData, getStepResult }) => {
    const prev = getStepResult<{ extractedData: any[] }>("extract-files");
    const extractedData = prev?.extractedData ?? inputData.extractedData;

    const structuredResults = extractedData.map((item: any) => ({
      fileId: item.fileId,
      resultInput: item.structuredData,
      rawText: item.rawText,
      isFallback: item.isFallback,
    }));

    return { structuredResults, errors: inputData.errors };
  },
});

/**
 * Step 3 — Persist & Suspend for Human Validation
 * Stores the extracted payload in workflow state and suspends the run.
 * The Gateway Agent resumes this run when the user issues `/validate`.
 */
const suspendStep = createStep({
  id: "suspend-for-validation",
  inputSchema: z.object({
    structuredResults: z.array(z.any()),
    errors: z.array(z.string()),
  }),
  outputSchema: z.object({
    suspended: z.boolean(),
    resultCount: z.number(),
    errors: z.array(z.string()),
  }),
  suspendSchema: z.object({
    stage: z.literal("awaiting-validation"),
    extractedResults: z.array(z.any()),
    errors: z.array(z.string()),
  }),
  stateSchema: extractionStateSchema,
  execute: async ({ inputData, suspend, setState }) => {
    const { structuredResults, errors } = inputData;

    if (structuredResults.length === 0) {
      return {
        suspended: false,
        resultCount: 0,
        errors: [...errors, "No data extracted from any file"],
      };
    }

    await setState({ extractedResults: structuredResults, errors });
    return await suspend({
      stage: "awaiting-validation",
      extractedResults: structuredResults,
      errors,
    });
  },
});

export const extractionWorkflow = createWorkflow({
  id: "document-extraction",
  description: "Document Extraction Workflow",
  inputSchema: extractionTriggerSchema,
  outputSchema: z.object({
    suspended: z.boolean(),
    resultCount: z.number(),
    errors: z.array(z.string()),
  }),
  stateSchema: extractionStateSchema,
});

extractionWorkflow
  .then(extractStep as any)
  .then(structureStep as any)
  .then(suspendStep as any);

extractionWorkflow.commit();
