import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { like } from "drizzle-orm";
import type { TenantContext } from "tenant-context";
import { StudentRepository } from "../../../../repository/student.repo";
import { StaffRepository } from "../../../../repository/staff.repo";
import { smStaffs } from "../../../../db/sms-schema";
import { bridgeToolContext } from "../../internal/bridge";

export type SearchCandidate = {
  id: number | string;
  name: string;
  class?: string;
  section?: string;
  classId?: number | null;
  sectionId?: number | null;
  admissionNumber?: string;
  [key: string]: unknown;
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
  message?: string;
};

export const searchEntityLogic = async (
  context: TenantContext,
  query: string,
  matches: SearchCandidate[],
  options?: { threadId?: string; modelId?: string },
): Promise<SearchResult> => {
  let candidates = matches;
  let matchSource: "fuzzy_match" | "exact_match" | "context_fallback" = "fuzzy_match";

  if (!query || query.trim() === "") {
    if (context.classId != null && context.sectionId != null) {
      candidates = matches.filter((c) => c.classId === context.classId && c.sectionId === context.sectionId);
      matchSource = "context_fallback";
    }
  } else {
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

  return {
    status: "NOT_FOUND",
  };
};

export const searchEntitySchema = z.object({
  query: z.string().describe("The search query. Can be a name, partial name, or admission number. If empty, returns all entities in the active class/section context."),
  entityType: z.enum(["student", "staff", "all"]).optional().default("all").describe("Filter by entity type. Defaults to 'all'."),
  classId: z.number().optional().describe("Optional explicit class ID to filter by. Defaults to the active context class."),
  sectionId: z.number().optional().describe("Optional explicit section ID to filter by. Defaults to the active context section."),
});

export const searchSchoolDirectoryTool = createTool({
  id: "search-school-directory",
  description: "Search the school directory for students or staff by name, admission number, or class context.",
  inputSchema: searchEntitySchema,
  execute: async (input, context) => {
    const ctx = await bridgeToolContext(context);
    const { tenantContext, getRepo, audit } = ctx;
    const studentRepo = getRepo(StudentRepository);
    const staffRepo = getRepo(StaffRepository);

    const resolvedClassId = input.classId ?? tenantContext.classId;
    const resolvedSectionId = input.sectionId ?? tenantContext.sectionId;

    const matches: SearchCandidate[] = [];

    if (input.entityType === "student" || input.entityType === "all") {
      if (!input.query || input.query.trim() === "") {
        if (resolvedClassId != null && resolvedSectionId != null) {
          const classStudents = await studentRepo.getStudentsByClassSection({
            classId: resolvedClassId,
            sectionId: resolvedSectionId,
          });
          if (classStudents) {
            matches.push(
              ...classStudents.map((s: { id: number; name?: string | null; admissionNo?: number | string | null }) => ({
                id: s.id,
                name: s.name || "Unknown",
                admissionNumber: s.admissionNo?.toString(),
                classId: resolvedClassId,
                sectionId: resolvedSectionId,
              })),
            );
          }
        } else {
          return {
            status: "NEEDS_CLARIFICATION",
            message:
              "Cannot list students without a class/section context. Provide classId/sectionId in the input or set the active workspace context.",
            audit: {
              source: "context_fallback",
              threadId: audit?.threadId,
              modelId: audit?.modelId,
            },
          } satisfies SearchResult;
        }
      } else {
        const students = await studentRepo.searchStudent(input.query, {
          classId: resolvedClassId,
          sectionId: resolvedSectionId,
        });
        matches.push(
          ...students.map((s: { studentId: number; fullName?: string | null; admissionNo?: number | string | null; className?: string | null; sectionName?: string | null }) => ({
            id: s.studentId,
            name: s.fullName || "Unknown",
            admissionNumber: s.admissionNo?.toString(),
            class: s.className || undefined,
            section: s.sectionName || undefined,
            classId: resolvedClassId,
            sectionId: resolvedSectionId,
          })),
        );
      }
    }

    if (input.entityType === "staff" || input.entityType === "all") {
      if (input.query && input.query.trim() !== "") {
        const searchPattern = `%${input.query}%`;
        const staffList = await staffRepo.db
          .select({
            id: smStaffs.id,
            name: smStaffs.fullName,
            email: smStaffs.email,
          })
          .from(smStaffs)
          .where(like(smStaffs.fullName, searchPattern))
          .limit(20);

        matches.push(
          ...staffList.map((s: { id: number; name?: string | null; email?: string | null }) => ({
            id: s.id,
            name: s.name || "Unknown",
            email: s.email,
          })),
        );
      }
    }

    return searchEntityLogic({ ...tenantContext, classId: resolvedClassId, sectionId: resolvedSectionId }, input.query, matches, {
      threadId: audit?.threadId,
      modelId: audit?.modelId,
    });
  },
  toModelOutput: (output: unknown) => {
    if (typeof output !== "object" || output === null) {
      return `Search status: UNKNOWN`;
    }
    const record = output as Record<string, unknown>;
    if (record.status === "SUCCESS" && record.entity && typeof record.entity === "object") {
      const entity = record.entity as { name?: unknown; id?: unknown; class?: unknown };
      return `Exact match: ${String(entity.name ?? "Unknown")} (ID: ${String(entity.id ?? "?")}, Class: ${entity.class ? String(entity.class) : "N/A"})`;
    }
    if (record.status === "NEEDS_CLARIFICATION" && Array.isArray(record.candidates)) {
      const list = record.candidates
        .map((c: unknown) => {
          if (typeof c !== "object" || c === null) return "- unknown";
          const candidate = c as { name?: unknown; id?: unknown; class?: unknown };
          return `- ${String(candidate.name ?? "Unknown")} (ID: ${String(candidate.id ?? "?")}, Class: ${candidate.class ? String(candidate.class) : "N/A"})`;
        })
        .join("\n");
      return `Multiple matches found. Please ask the user to clarify:\n${list}`;
    }
    return `Search status: ${String(record.status ?? "UNKNOWN")}`;
  },
});