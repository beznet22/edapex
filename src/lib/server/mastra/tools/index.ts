import { createTool } from "@mastra/core/tools";
import type { z } from "zod";
import { contextTools } from "./operations/context";
import { readTools } from "./operations/read";
import { writeTools } from "./operations/write";
import { destructiveTools } from "./operations/destructive";
import { parentTools } from "./operations/parent";
import { searchSchoolDirectoryTool } from "./operations/read/search-school-directory";
import {
  extractSchema,
  extractLogic,
  validateSchema,
  validateLogic,
  publishSchema,
  publishLogic,
  generateSchema,
  generateLogic,
} from "./operations/reporting/workflow-tools";
import type { MastraToolContext } from "../tenant-context";

export { searchSchoolDirectoryTool as searchEntityTool };

export const coreTools = {
  ...contextTools,
  ...readTools,
  ...writeTools,
  ...destructiveTools,
  ...parentTools,
};

export async function loadReportingTools(): Promise<Record<string, ReturnType<typeof Object>>> {
  const mod = await import("./operations/reporting");
  return mod.reportingTools;
}

function hasMessageField(value: unknown): value is { message: unknown } {
  return typeof value === "object" && value !== null && "message" in value;
}

function isMastraToolContext(value: unknown): value is MastraToolContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "tenantContext" in value &&
    "getRepo" in value
  );
}

export const extractTool = createTool({
  id: "extract-document",
  description: "Extract text and structure from a scanned result document for the active academic term.",
  inputSchema: extractSchema,
  execute: async (input: z.input<typeof extractSchema>, context) => {
    if (!isMastraToolContext(context)) {
      throw new Error("extract-document requires a valid Mastra tool context");
    }
    const parsed = extractSchema.parse(input);
    return extractLogic(context, parsed);
  },
  toModelOutput: (output: unknown) => {
    if (hasMessageField(output) && typeof output.message === "string") {
      return output.message;
    }
    return JSON.stringify(output);
  },
});

export const validateTool = createTool({
  id: "validate-extraction",
  description: "Validate an extracted result record against subject-level and term-level business rules.",
  inputSchema: validateSchema,
  execute: async (input: z.input<typeof validateSchema>, context) => {
    if (!isMastraToolContext(context)) {
      throw new Error("validate-extraction requires a valid Mastra tool context");
    }
    const parsed = validateSchema.parse(input);
    return validateLogic(context, parsed);
  },
  toModelOutput: (output: unknown) => {
    if (hasMessageField(output) && typeof output.message === "string") {
      return output.message;
    }
    return JSON.stringify(output);
  },
});

export const publishTool = createTool({
  id: "publish-results",
  description: "Publish validated student results: render report cards and notify parents for the active academic term.",
  inputSchema: publishSchema,
  execute: async (input: z.input<typeof publishSchema>, context) => {
    if (!isMastraToolContext(context)) {
      throw new Error("publish-results requires a valid Mastra tool context");
    }
    const parsed = publishSchema.parse(input);
    return publishLogic(context, parsed);
  },
  toModelOutput: (output: unknown) => {
    if (hasMessageField(output) && typeof output.message === "string") {
      return output.message;
    }
    return JSON.stringify(output);
  },
});

export const generateTool = createTool({
  id: "generate-results",
  description: "Generate structured student-result records from validated extracted text for the active academic term.",
  inputSchema: generateSchema,
  execute: async (input: z.input<typeof generateSchema>, context) => {
    if (!isMastraToolContext(context)) {
      throw new Error("generate-results requires a valid Mastra tool context");
    }
    const parsed = generateSchema.parse(input);
    return generateLogic(context, parsed);
  },
  toModelOutput: (output: unknown) => {
    if (hasMessageField(output) && typeof output.message === "string") {
      return output.message;
    }
    return JSON.stringify(output);
  },
});

export const workflowTools = {
  extractTool,
  validateTool,
  publishTool,
  generateTool,
};