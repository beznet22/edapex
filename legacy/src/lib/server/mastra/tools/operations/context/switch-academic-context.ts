import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTenantContext, type MastraToolContext, type TenantContext } from "../../../tenant-context";

export const switchWorkspaceSchema = z.object({
  newClassId: z.number().int().positive().describe("Numeric ID of the new class to switch context to"),
  newSectionId: z.number().int().positive().describe("Numeric ID of the new section to switch context to"),
});

export const switchWorkspaceLogic = async (context: TenantContext, newClassId: number, newSectionId: number) => {
  const newContext = createTenantContext({
    ...context,
    classId: newClassId,
    sectionId: newSectionId,
  });

  return {
    status: "SUCCESS",
    message: `Switched to Class ${newClassId} - Section ${newSectionId}.`,
    newContext,
  };
};

function isMastraToolContext(value: unknown): value is MastraToolContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "tenantContext" in value
  );
}

function isStatusWithMessage(value: unknown): value is { status: string; message?: unknown } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.status === "string";
}

export const switchAcademicContextTool = createTool({
  id: "switch-academic-context",
  description: "Atomically switch the active class, section, and academic term for the current session.",
  inputSchema: switchWorkspaceSchema,
  execute: async (input, rawContext) => {
    if (!isMastraToolContext(rawContext)) {
      throw new Error("switch-academic-context requires a valid Mastra tool context");
    }
    const tenant: TenantContext = rawContext.tenantContext;
    return switchWorkspaceLogic(tenant, input.newClassId, input.newSectionId);
  },
  toModelOutput: (output: unknown) => {
    if (isStatusWithMessage(output) && typeof output.message === "string") {
      return output.message;
    }
    return JSON.stringify(output);
  },
});