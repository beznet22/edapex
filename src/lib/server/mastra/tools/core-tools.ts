import { z } from "zod";
import type { TenantContext, MastraToolContext } from "../tenant-context";

export type SearchCandidate = {
  id: number | string;
  name: string;
  class?: string;
  section?: string;
  classId?: number | null;
  sectionId?: number | null;
  admissionNumber?: string;
  [key: string]: any;
};

export type SearchResult = {
  status: "SUCCESS" | "NEEDS_CLARIFICATION" | "NOT_FOUND";
  entity?: SearchCandidate;
  candidates?: SearchCandidate[];
  audit?: {
    source: "fuzzy_match" | "exact_match" | "context_fallback";
    threadId?: string;
    modelId?: string;
  };
};

export const searchEntityLogic = async (
  context: TenantContext,
  query: string,
  matches: SearchCandidate[],
  options?: { threadId?: string; modelId?: string },
): Promise<SearchResult> => {
  let candidates = matches;
  let matchSource: "fuzzy_match" | "exact_match" | "context_fallback" = "fuzzy_match";

  // If empty query, filter by context's classId and sectionId if available
  if (!query || query.trim() === "") {
    if (context.classId != null && context.sectionId != null) {
      candidates = matches.filter((c) => c.classId === context.classId && c.sectionId === context.sectionId);
      matchSource = "context_fallback";
    }
  } else {
    // Priority: Check if there's an exact match on Admission Number
    const exactAdmissionMatch = matches.find(
      (c) => c.admissionNumber && c.admissionNumber.toLowerCase() === query.trim().toLowerCase(),
    );
    if (exactAdmissionMatch) {
      return {
        status: "SUCCESS",
        entity: exactAdmissionMatch,
        audit: {
          source: "exact_match",
          threadId: options?.threadId,
          modelId: options?.modelId,
        },
      };
    }
  }

  // If it's an exact match or single match
  if (candidates.length === 1) {
    return {
      status: "SUCCESS",
      entity: candidates[0],
      audit: {
        source: matchSource,
        threadId: options?.threadId,
        modelId: options?.modelId,
      },
    };
  }

  // If there are multiple matches, we need to disambiguate
  if (candidates.length > 1) {
    return {
      status: "NEEDS_CLARIFICATION",
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        class: c.class,
        section: c.section,
      })),
    };
  }

  // No matches found
  return {
    status: "NOT_FOUND",
  };
};

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


export const switchWorkspaceSchema = z.object({
  newClassId: z.number().int().positive().describe("Numeric ID of the new class to switch context to"),
  newSectionId: z.number().int().positive().describe("Numeric ID of the new section to switch context to"),
});

export const switchWorkspaceLogic = async (context: any, newClassId: number, newSectionId: number) => {
  const { createTenantContext } = await import("../tenant-context");

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
