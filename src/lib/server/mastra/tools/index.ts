import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import {
  onboardEntitySchema,
  onboardEntityLogic,
  assignEntitySchema,
  assignEntityLogic,
} from "./onboard-tools";
import { manageResultsSchema, manageResultsLogic } from "./grading-tools";
import {
  manageAccessSchema,
  manageAccessLogic,
  patchEntitySchema,
  patchEntityLogic,
} from "./gov-tools";
import { searchEntityLogic, systemStatusLogic, systemStatusSchema, switchWorkspaceSchema, switchWorkspaceLogic, type SearchCandidate, type SearchResult } from "./core-tools";
import {
  extractSchema,
  extractLogic,
  validateSchema,
  validateLogic,
  publishSchema,
  publishLogic,
  generateSchema,
  generateLogic,
} from "./workflow-tools";
import { StudentRepository } from "../../repository/student.repo";
import { StaffRepository } from "../../repository/staff.repo";
import { smStaffs } from "../../db/sms-schema";
import { like } from "drizzle-orm";

export const onboardTool = createTool({
  id: "enroll-student",
  description: "Enroll a new student into a class, with their guardian record, in the active academic context.",
  inputSchema: onboardEntitySchema,
  execute: async (input: any, context: any) => {
    return onboardEntityLogic(context, input);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

export const patchTool = createTool({
  id: "update-student-biodata",
  description: "Update an enrolled student's personal details or guardian information in the active academic context.",
  inputSchema: patchEntitySchema,
  execute: async (input: any, context: any) => {
    return patchEntityLogic(context, input);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

export const gradingTool = createTool({
  id: "manage-academic-records",
  description: "Record student marks, attendance, teacher remarks, and behavioral ratings for the active academic term.",
  inputSchema: manageResultsSchema,
  execute: async (input: any, context: any) => {
    return manageResultsLogic(context, input);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

export const assignTool = createTool({
  id: "transfer-student",
  description: "Transfer an enrolled student to a different class or section within the active school.",
  inputSchema: assignEntitySchema,
  execute: async (input: any, context: any) => {
    return assignEntityLogic(context, input);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

export const switchWorkspaceTool = createTool({
  id: "switch-academic-context",
  description: "Atomically switch the active class, section, and academic term for the current session.",
  inputSchema: switchWorkspaceSchema,
  execute: async (input: any, context: any) => {
    return switchWorkspaceLogic(context, input.newClassId, input.newSectionId);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

export const manageAccessTool = createTool({
  id: "manage-account-access",
  description: "Manage the account state of a student or staff member: suspend, restore, reset password, or delete.",
  inputSchema: manageAccessSchema,
  execute: async (input: any, context: any) => {
    return manageAccessLogic(context, input);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

export const searchEntityTool = createTool({
  id: "search-school-directory",
  description: "Search the school directory for students or staff by name, admission number, or class context.",
  inputSchema: z.object({
    query: z.string().describe("The search query. Can be a name, partial name, or admission number. If empty, returns all entities in the active class/section context."),
    entityType: z.enum(["student", "staff", "all"]).optional().default("all").describe("Filter by entity type. Defaults to 'all'."),
    classId: z.number().optional().describe("Optional explicit class ID to filter by. Defaults to the active context class."),
    sectionId: z.number().optional().describe("Optional explicit section ID to filter by. Defaults to the active context section."),
  }),
  execute: async (input: any, context: any) => {
    const { tenantContext, getRepo } = context;
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
              ...classStudents.map((s: any) => ({
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
              threadId: context.audit?.threadId,
              modelId: context.audit?.modelId,
            },
          } as SearchResult;
        }
      } else {
        const students = await studentRepo.searchStudent(input.query, {
          classId: resolvedClassId,
          sectionId: resolvedSectionId,
        });
        matches.push(
          ...students.map((s: any) => ({
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
          ...staffList.map((s: any) => ({
            id: s.id,
            name: s.name || "Unknown",
            email: s.email,
          })),
        );
      }
    }

    return searchEntityLogic({ ...tenantContext, classId: resolvedClassId, sectionId: resolvedSectionId }, input.query, matches, {
      threadId: context.audit?.threadId,
      modelId: context.audit?.modelId,
    });
  },
  toModelOutput: (output: any) => {
    if (output.status === "SUCCESS" && output.entity) {
      return `Exact match: ${output.entity.name} (ID: ${output.entity.id}, Class: ${output.entity.class || 'N/A'})`;
    }
    if (output.status === "NEEDS_CLARIFICATION" && output.candidates) {
      const list = output.candidates.map((c: any) => `- ${c.name} (ID: ${c.id}, Class: ${c.class || 'N/A'})`).join('\n');
      return `Multiple matches found. Please ask the user to clarify:\n${list}`;
    }
    return `Search status: ${output.status}`;
  },
});

export const systemStatusTool = createTool({
  id: "get-academic-context",
  description: "Show the active class, section, and academic term for the current session.",
  inputSchema: systemStatusSchema,
  execute: async (_: any, context: any) => {
    return systemStatusLogic(context);
  },
  toModelOutput: (output: any) => {
    if (output.tenant) {
      return `Active Context - Class ID: ${output.tenant.classId}, Section ID: ${output.tenant.sectionId}, Academic Term ID: ${output.tenant.examId}`;
    }
    return JSON.stringify(output);
  },
});

export const extractTool = createTool({
  id: "extract-document",
  description: "Extract text and structure from a scanned result document for the active academic term.",
  inputSchema: extractSchema,
  execute: async (input: any, context: any) => {
    return extractLogic(context, input);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

export const validateTool = createTool({
  id: "validate-extraction",
  description: "Validate an extracted result record against subject-level and term-level business rules.",
  inputSchema: validateSchema,
  execute: async (input: any, context: any) => {
    return validateLogic(context, input);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

export const publishTool = createTool({
  id: "publish-results",
  description: "Publish validated student results: render report cards and notify parents for the active academic term.",
  inputSchema: publishSchema,
  execute: async (input: any, context: any) => {
    return publishLogic(context, input);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

/** B12: the missing generate tool. id matches generateWorkflow's id so chat-helper.ts can resolve it for /generate. */
export const generateTool = createTool({
  id: "generate-results",
  description: "Generate structured student-result records from validated extracted text for the active academic term.",
  inputSchema: generateSchema,
  execute: async (input: any, context: any) => {
    return generateLogic(context, input);
  },
  toModelOutput: (output: any) => {
    return output.message || JSON.stringify(output);
  },
});

export const coreTools = {
  onboardTool,
  patchTool,
  gradingTool,
  assignTool,
  switchWorkspaceTool,
  manageAccessTool,
  searchEntityTool,
  systemStatusTool,
};

export const workflowTools = {
  extractTool,
  validateTool,
  publishTool,
  generateTool,
};
