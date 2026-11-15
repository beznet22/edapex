import { createTool } from "@mastra/core/tools";
import type { MastraToolContext } from "$lib/server/mastra/tenant-context";
import { z } from "zod";

export const systemStatusSchema = z.object({});

export const systemStatusLogic = async (context: MastraToolContext) => {
  const { tenantContext } = context;
  return {
    status: "SUCCESS" as const,
    tenant: {
      schoolId: tenantContext.schoolId,
      classId: tenantContext.classId,
      sectionId: tenantContext.sectionId,
      examId: tenantContext.examId,
      academicId: tenantContext.academicId,
      userId: tenantContext.userId,
      designationId: tenantContext.designationId,
    },
  };
};

function isMastraToolContext(value: unknown): value is MastraToolContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "tenantContext" in value
  );
}

function isStatusWithTenant(
  value: unknown,
): value is { status: string; tenant?: { classId: number | null; sectionId: number | null; examId: number | null } } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.status !== "string") return false;
  if (record.tenant === undefined) return true;
  if (typeof record.tenant !== "object" || record.tenant === null) return false;
  const tenant = record.tenant as Record<string, unknown>;
  return (
    "classId" in tenant &&
    "sectionId" in tenant &&
    "examId" in tenant
  );
}

export const getAcademicContextTool = createTool({
  id: "get-academic-context",
  description: "Show the active class, section, and academic term for the current session.",
  inputSchema: systemStatusSchema,
  execute: async (_input, rawContext) => {
    if (!isMastraToolContext(rawContext)) {
      throw new Error("get-academic-context requires a valid Mastra tool context");
    }
    return systemStatusLogic(rawContext);
  },
  toModelOutput: (output: unknown) => {
    if (isStatusWithTenant(output) && output.tenant) {
      return `Active Context - Class ID: ${output.tenant.classId}, Section ID: ${output.tenant.sectionId}, Academic Term ID: ${output.tenant.examId}`;
    }
    return JSON.stringify(output);
  },
});