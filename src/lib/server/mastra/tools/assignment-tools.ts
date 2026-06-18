import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import {
	validateRoleWhitelist,
	ForbiddenError,
	type MastraToolContext,
	type TenantContext,
} from "../tenant-context";
import { AssignmentRepository } from "../../repository/assignment.repo";

export const assignStaffToClassSchema = z.object({
	staffId: z.number().describe("Numeric ID of the staff member to assign as class teacher"),
	classId: z.number().describe("Numeric ID of the class"),
	sectionId: z.number().describe("Numeric ID of the section"),
});

export type AssignStaffToClassPayload = z.infer<typeof assignStaffToClassSchema>;

export const assignStaffToSubjectSchema = z.object({
	staffId: z.number().describe("Numeric ID of the staff member to assign as subject teacher"),
	classId: z.number().describe("Numeric ID of the class"),
	sectionId: z.number().describe("Numeric ID of the section"),
	subjectId: z.number().describe("Numeric ID of the subject"),
});

export type AssignStaffToSubjectPayload = z.infer<typeof assignStaffToSubjectSchema>;

export const teacherSelfAssignClassSchema = z.object({
	classId: z.number().describe("Numeric ID of the class"),
	sectionId: z.number().describe("Numeric ID of the section"),
});

export type TeacherSelfAssignClassPayload = z.infer<typeof teacherSelfAssignClassSchema>;

type AssignmentSuccess = {
	status: "SUCCESS";
	message: string;
};

type AssignmentError = {
	status: "ERROR";
	errorCode: string;
	message: string;
};

type AssignmentResult = AssignmentSuccess | AssignmentError;

function validateIsStaff(context: TenantContext): void {
	if (context.staffId <= 0) {
		throw new ForbiddenError();
	}
}

function formatAssignmentOutput(output: unknown): string {
	if (
		typeof output === "object" &&
		output !== null &&
		"message" in output &&
		typeof output.message === "string"
	) {
		return output.message;
	}
	return JSON.stringify(output);
}

function normalizeError(error: unknown): AssignmentError {
	const message = error instanceof Error ? error.message : String(error);
	return {
		status: "ERROR",
		errorCode: "UNKNOWN",
		message,
	};
}

export const assignStaffToClassLogic = async (
	context: MastraToolContext,
	params: AssignStaffToClassPayload,
): Promise<AssignmentResult> => {
	validateRoleWhitelist(context.tenantContext, [1, 5]);

	const repo = context.getRepo(AssignmentRepository);
	try {
		const result = await repo.assignClassTeacher({
			classId: params.classId,
			sectionId: params.sectionId,
			staffId: params.staffId,
		});
		return {
			status: "SUCCESS",
			message: `Staff ${params.staffId} assigned as class teacher for class ${params.classId}, section ${params.sectionId} (assignment ${result.assignClassTeacherId}).`,
		};
	} catch (error) {
		return normalizeError(error);
	}
};

export const assignStaffToSubjectLogic = async (
	context: MastraToolContext,
	params: AssignStaffToSubjectPayload,
): Promise<AssignmentResult> => {
	validateRoleWhitelist(context.tenantContext, [1, 5]);

	const repo = context.getRepo(AssignmentRepository);
	try {
		await repo.assignSubjectTeacher({
			classId: params.classId,
			sectionId: params.sectionId,
			subjectId: params.subjectId,
			staffId: params.staffId,
		});
		return {
			status: "SUCCESS",
			message: `Staff ${params.staffId} assigned to teach subject ${params.subjectId} for class ${params.classId}, section ${params.sectionId}.`,
		};
	} catch (error) {
		return normalizeError(error);
	}
};

export const teacherSelfAssignClassLogic = async (
	context: MastraToolContext,
	params: TeacherSelfAssignClassPayload,
): Promise<AssignmentResult> => {
	validateIsStaff(context.tenantContext);

	const repo = context.getRepo(AssignmentRepository);
	try {
		const result = await repo.assignClassTeacher({
			classId: params.classId,
			sectionId: params.sectionId,
			staffId: context.tenantContext.staffId,
		});
		return {
			status: "SUCCESS",
			message: `You are assigned as class teacher for class ${params.classId}, section ${params.sectionId} (assignment ${result.assignClassTeacherId}).`,
		};
	} catch (error) {
		return normalizeError(error);
	}
};

function assertMastraToolContext(
	context: ToolExecutionContext,
): asserts context is MastraToolContext & ToolExecutionContext {
	if (!("tenantContext" in context) || !("getRepo" in context)) {
		throw new Error("Invalid tool execution context: expected MastraToolContext");
	}
}

export const assignStaffToClassTool = createTool({
	id: "assign-staff-to-class",
	description:
		"Assign a staff member as the class teacher for a specific class and section in the active academic year.",
	inputSchema: assignStaffToClassSchema,
	execute: async (input: AssignStaffToClassPayload, context: ToolExecutionContext) => {
		assertMastraToolContext(context);
		return assignStaffToClassLogic(context, input);
	},
	toModelOutput: (output: unknown) => formatAssignmentOutput(output),
});

export const assignStaffToSubjectTool = createTool({
	id: "assign-staff-to-subject",
	description:
		"Assign a staff member as the subject teacher for a specific class, section, and subject in the active academic year.",
	inputSchema: assignStaffToSubjectSchema,
	execute: async (input: AssignStaffToSubjectPayload, context: ToolExecutionContext) => {
		assertMastraToolContext(context);
		return assignStaffToSubjectLogic(context, input);
	},
	toModelOutput: (output: unknown) => formatAssignmentOutput(output),
});

export const teacherSelfAssignClassTool = createTool({
	id: "teacher-self-assign-class",
	description:
		"Allow the currently authenticated teacher to assign themselves as the class teacher for a class and section.",
	inputSchema: teacherSelfAssignClassSchema,
	execute: async (input: TeacherSelfAssignClassPayload, context: ToolExecutionContext) => {
		assertMastraToolContext(context);
		return teacherSelfAssignClassLogic(context, input);
	},
	toModelOutput: (output: unknown) => formatAssignmentOutput(output),
});
