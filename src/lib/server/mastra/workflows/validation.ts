import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { resultInputSchema, type ResultInput } from "$lib/schema/result-input";
import { categoryEnum } from "$lib/schema/result-output";
import { assessment } from "../../service/assessment.service";
import { applyGradingBusinessLogic, validateAttendance } from "../../helpers/extract-helper";

/**
 * Trigger schema for the validation workflow.
 * Receives extracted results from a prior extraction run and the staff context
 * required to commit validated data to the school management layer.
 */
const validationTriggerSchema = z.object({
  extractedResults: z.array(
    z.object({
      fileId: z.string(),
      resultInput: z.any(),
      rawText: z.string(),
      isFallback: z.boolean(),
    }),
  ),
  staffId: z.number().int().positive(),
  tenantContext: z.object({
    schoolId: z.number().int().positive(),
  }),
});

/**
 * Workflow state schema for tracking validation outcomes across steps.
 */
const validationStateSchema = z.object({
  validatedResults: z.array(z.any()).optional(),
  invalidResults: z.array(z.any()).optional(),
  errors: z.array(z.string()).optional(),
  committedCount: z.number().optional(),
});

/**
 * Step 1 — Schema Validation
 * Validates every extracted result against the strict resultInputSchema.
 * Results are split into valid (ready for business logic) and invalid
 * (with detailed error messages for UI review).
 */
const validateSchemaStep = createStep({
  id: "validate-schema",
  inputSchema: validationTriggerSchema,
  outputSchema: z.object({
    valid: z.array(z.any()),
    invalid: z.array(
      z.object({
        fileId: z.string(),
        errors: z.array(z.string()),
        rawText: z.string(),
        isFallback: z.boolean(),
      }),
    ),
    errors: z.array(z.string()),
  }),
  stateSchema: validationStateSchema,
  execute: async ({ inputData, setState }) => {
    const { extractedResults } = inputData;
    const valid: Array<{ fileId: string; resultInput: ResultInput; rawText: string; isFallback: boolean }> =
      [];
    const invalid: Array<{ fileId: string; errors: string[]; rawText: string; isFallback: boolean }> = [];
    const errors: string[] = [];

    for (const item of extractedResults) {
      try {
        const parseResult = await resultInputSchema.safeParseAsync(item.resultInput);
        if (parseResult.success) {
          valid.push({
            fileId: item.fileId,
            resultInput: parseResult.data,
            rawText: item.rawText,
            isFallback: item.isFallback,
          });
        } else {
          const issueMessages = parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
          invalid.push({
            fileId: item.fileId,
            errors: issueMessages,
            rawText: item.rawText,
            isFallback: item.isFallback,
          });
          errors.push(`Schema validation failed for ${item.fileId}: ${issueMessages.join("; ")}`);
        }
      } catch (error: any) {
        errors.push(`Unexpected validation error for ${item.fileId}: ${error.message || String(error)}`);
      }
    }

    await setState({ validatedResults: valid, invalidResults: invalid, errors });
    return { valid, invalid, errors };
  },
});

/**
 * Step 2 — Apply Business Logic
 * Calculates cumulative grades, validates attendance consistency,
 * and applies HTML grade formatting in-memory. No DB writes occur here.
 */
const applyLogicStep = createStep({
  id: "apply-business-logic",
  inputSchema: z.object({
    valid: z.array(z.any()),
    invalid: z.array(z.any()),
    errors: z.array(z.string()),
  }),
  outputSchema: z.object({
    processed: z.array(z.any()),
    invalid: z.array(z.any()),
    errors: z.array(z.string()),
  }),
  stateSchema: validationStateSchema,
  execute: async ({ inputData, getStepResult, setState }) => {
    const prev = getStepResult<{ valid: any[]; invalid: any[]; errors: string[] }>("validate-schema");
    const valid = prev?.valid ?? inputData.valid;
    const invalid = prev?.invalid ?? inputData.invalid;
    const errors = [...(prev?.errors ?? inputData.errors)];

    const processed = valid
      .map((item: any) => {
        try {
          const data = item.resultInput as ResultInput;
          const category = categoryEnum.parse(data.studentData.studentCategory);

          // Apply grading business logic and HTML formatting
          const graded = applyGradingBusinessLogic(data, category);

          // Validate attendance consistency
          if (graded.studentData?.attendance) {
            graded.studentData.attendance = validateAttendance(graded.studentData.attendance);
          }

          return {
            fileId: item.fileId,
            resultInput: graded as ResultInput,
            rawText: item.rawText,
            isFallback: item.isFallback,
          };
        } catch (error: any) {
          errors.push(`Business logic error for ${item.fileId}: ${error.message || String(error)}`);
          invalid.push({
            fileId: item.fileId,
            errors: [error.message || String(error)],
            rawText: item.rawText,
            isFallback: item.isFallback,
          });
          return null;
        }
      })
      .filter((item: any) => item !== null);

    await setState({ validatedResults: processed, invalidResults: invalid, errors });
    return { processed, invalid, errors };
  },
});

/**
 * Step 3 — Commit to Database
 * Atomically writes each validated and processed result into the school DB
 * via AssessmentService.upsertStudentResult, wrapped in a Drizzle transaction.
 */
const commitDbStep = createStep({
  id: "commit-results",
  inputSchema: z.object({
    processed: z.array(z.any()),
    invalid: z.array(z.any()),
    errors: z.array(z.string()),
  }),
  outputSchema: z.object({
    committedCount: z.number(),
    failedCount: z.number(),
    errors: z.array(z.string()),
  }),
  stateSchema: validationStateSchema,
  execute: async ({ inputData, getStepResult, getInitData, setState }) => {
    const prev = getStepResult<{
      processed: any[];
      invalid: any[];
      errors: string[];
    }>("apply-business-logic");
    const processed = prev?.processed ?? inputData.processed;
    const errors = [...(prev?.errors ?? inputData.errors)];
    let committedCount = 0;
    let failedCount = 0;

    const initData = getInitData<{ staffId?: number }>();
    const staffId = initData?.staffId ?? 1;

    for (const item of processed) {
      try {
        const resultInput = item.resultInput as ResultInput;
        await assessment.upsertStudentResult(resultInput, staffId);
        committedCount++;
      } catch (error: any) {
        failedCount++;
        errors.push(`DB commit failed for ${item.fileId}: ${error.message || String(error)}`);
      }
    }

    await setState({
      validatedResults: processed,
      errors,
      committedCount,
    });

    return { committedCount, failedCount, errors };
  },
});

export const validationWorkflow = createWorkflow({
  id: "result-validation",
  description: "Result Validation Workflow",
  inputSchema: validationTriggerSchema,
  outputSchema: z.object({
    committedCount: z.number(),
    failedCount: z.number(),
    errors: z.array(z.string()),
  }),
  stateSchema: validationStateSchema,
});

validationWorkflow
  .then(validateSchemaStep as any)
  .then(applyLogicStep as any)
  .then(commitDbStep as any);

validationWorkflow.commit();
