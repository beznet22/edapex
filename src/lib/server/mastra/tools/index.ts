import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import {
  onboardEntitySchema,
  onboardEntityLogic,
  patchEntitySchema,
  patchEntityLogic,
} from "./onboard-tools";
import { manageResultsSchema, manageResultsLogic } from "./grading-tools";
import { assignEntitySchema, assignEntityLogic } from "./assign-tools";
import {
  switchWorkspaceSchema,
  switchWorkspaceLogic,
  manageAccessSchema,
  manageAccessLogic,
} from "./gov-tools";
import { searchEntityLogic, systemStatusLogic, systemStatusSchema, type SearchCandidate } from "./core-tools";
import {
  extractSchema,
  extractLogic,
  validateSchema,
  validateLogic,
  publishSchema,
  publishLogic,
} from "./workflow-tools";
import { StudentRepository } from "../../repository/student.repo";
import { StaffRepository } from "../../repository/staff.repo";
import { smStaffs } from "../../db/sms-schema";
import { like } from "drizzle-orm";

export const onboardTool = createTool({
  id: "onboard-entity",
  description: "Onboard a new student, guardian, or class.",
  inputSchema: onboardEntitySchema,
  execute: async (input: any, context: any) => {
    return onboardEntityLogic(context, input);
  },
});

export const patchTool = createTool({
  id: "patch-entity",
  description: "Update or edit an existing student, guardian, or class record.",
  inputSchema: patchEntitySchema,
  execute: async (input: any, context: any) => {
    return patchEntityLogic(context, input);
  },
});

export const gradingTool = createTool({
  id: "manage-results",
  description: "Manage student marks, attendance, remarks, and behavioral ratings.",
  inputSchema: manageResultsSchema,
  execute: async (input: any, context: any) => {
    return manageResultsLogic(context, input);
  },
});

export const assignTool = createTool({
  id: "assign-entity",
  description: "Assign or transfer a student to a class and section.",
  inputSchema: assignEntitySchema,
  execute: async (input: any, context: any) => {
    return assignEntityLogic(context, input);
  },
});

export const switchWorkspaceTool = createTool({
  id: "switch-workspace",
  description: "Atomic context switch between classes or sections.",
  inputSchema: switchWorkspaceSchema,
  execute: async (input: any, context: any) => {
    return switchWorkspaceLogic(context, input.newClassId, input.newSectionId);
  },
});

export const manageAccessTool = createTool({
  id: "manage-access",
  description: "Ban, suspend, reset password, or delete students and staff.",
  inputSchema: manageAccessSchema,
  execute: async (input: any, context: any) => {
    return manageAccessLogic(context, input);
  },
});

export const searchEntityTool = createTool({
  id: "search-entity",
  description: "Search for students or staff by name or admission number.",
  inputSchema: z.object({
    query: z.string(),
    entityType: z.enum(["student", "staff", "all"]).optional().default("all"),
    classId: z.number().optional(),
    sectionId: z.number().optional(),
  }),
  execute: async (input: any, context: any) => {
    const { tenantContext, getRepo } = context;
    const studentRepo = getRepo(StudentRepository);
    const staffRepo = getRepo(StaffRepository);

    const matches: SearchCandidate[] = [];

    if (input.entityType === "student" || input.entityType === "all") {
      if (!input.query || input.query.trim() === "") {
        if (tenantContext.classId != null && tenantContext.sectionId != null) {
          const classStudents = await studentRepo.getStudentsByClassSection({
            classId: tenantContext.classId,
            sectionId: tenantContext.sectionId,
          });
          if (classStudents) {
            matches.push(
              ...classStudents.map((s: any) => ({
                id: s.id,
                name: s.name || "Unknown",
                admissionNumber: s.admissionNo?.toString(),
                classId: tenantContext.classId,
                sectionId: tenantContext.sectionId,
              })),
            );
          }
        }
      } else {
        const students = await studentRepo.searchStudent(input.query);
        matches.push(
          ...students.map((s: any) => ({
            id: s.studentId,
            name: s.fullName || "Unknown",
            admissionNumber: s.admissionNo?.toString(),
            class: s.className || undefined,
            section: s.sectionName || undefined,
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

    return searchEntityLogic(tenantContext, input.query, matches, {
      threadId: context.audit?.threadId,
      modelId: context.audit?.modelId,
    });
  },
});

export const systemStatusTool = createTool({
  id: "system-status",
  description: "Check system health and current tenant context.",
  inputSchema: systemStatusSchema,
  execute: async (_: any, context: any) => {
    return systemStatusLogic(context);
  },
});

export const extractTool = createTool({
  id: "extract-document",
  description: "Extract data from uploaded documents/images via OCR. Initiates the extraction workflow.",
  inputSchema: extractSchema,
  execute: async (input: any, context: any) => {
    return extractLogic(context, input);
  },
});

export const validateTool = createTool({
  id: "validate-extraction",
  description: "Validate extracted data against schema and business rules. Resumes a suspended extraction workflow.",
  inputSchema: validateSchema,
  execute: async (input: any, context: any) => {
    return validateLogic(context, input);
  },
});

export const publishTool = createTool({
  id: "publish-results",
  description: "Publish validated results — generates PDF report cards and dispatches email notifications.",
  inputSchema: publishSchema,
  execute: async (input: any, context: any) => {
    return publishLogic(context, input);
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
};
