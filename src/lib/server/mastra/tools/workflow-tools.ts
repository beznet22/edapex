import { z } from "zod";
import type { MastraToolContext } from "../tenant-context";
import { AssessmentService } from "../../service/assessment.service";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const extractSchema = z.object({
	fileUrls: z.array(z.string().url()).min(1).describe("URLs of uploaded documents/images to extract data from"),
	targetType: z.enum(["marks", "attendance", "roster"]).default("marks").describe("Type of data to extract"),
	classId: z.number().optional().describe("Target class ID (falls back to tenant context)"),
	sectionId: z.number().optional().describe("Target section ID (falls back to tenant context)"),
});

export const validateSchema = z.object({
	workflowRunId: z.string().optional().describe("ID of the suspended extraction workflow to validate. If omitted, validates the latest run for this thread."),
	studentIds: z.array(z.number()).optional().describe("Specific student IDs to validate. If omitted, validates all students in the extraction."),
});

export const publishSchema = z.object({
	scope: z.enum(["all", "student"]).default("all").describe("Publish scope: all validated students or a specific student"),
	studentId: z.number().optional().describe("Student ID to publish (required when scope is 'student')"),
	generatePdf: z.boolean().default(true).describe("Whether to generate PDF report cards"),
	sendEmail: z.boolean().default(true).describe("Whether to dispatch email notifications to parents/guardians"),
});

/** B12: Schema for the missing generate tool. Mirrors generateTriggerSchema in workflows/generate.ts:8-17 minus the embedded tenantContext (which the bridge provides). */
export const generateSchema = z.object({
	fileIds: z.array(z.string().min(1)).min(1).describe("File IDs returned by the previous /extract step (e.g. mistral-ocr fileIds)"),
	classId: z.number().int().positive().describe("Target class ID"),
	sectionId: z.number().int().positive().describe("Target section ID"),
	staffId: z.number().int().positive().optional().describe("Submitting teacher's staff ID (falls back to tenantContext.staffId)"),
});

// ─── Extract Logic ────────────────────────────────────────────────────────────

export type ExtractionResult = {
	status: "EXTRACTION_STARTED" | "EXTRACTION_COMPLETE" | "EXTRACTION_FAILED";
	workflowRunId?: string;
	extractedCount?: number;
	errors?: string[];
	stagingData?: Record<string, any>[];
};

export const extractLogic = async (
	context: MastraToolContext,
	input: z.infer<typeof extractSchema>
): Promise<ExtractionResult> => {
	const { tenantContext, getService, mastra } = context;
	const classId = input.classId ?? tenantContext.classId;
	const sectionId = input.sectionId ?? tenantContext.sectionId;

	if (!classId || !sectionId) {
		return {
			status: "EXTRACTION_FAILED",
			errors: ["No active class/section context. Please select a class before extracting."]
		};
	}

	const service = getService(AssessmentService) as AssessmentService & {
		runExtractionForTool: (params: unknown) => Promise<ExtractionResult>;
	};

	return service.runExtractionForTool({
		provider: contextProvider(context),
		mastra,
		userId: tenantContext.userId,
		teacherId: tenantContext.staffId,
		classId,
		sectionId,
		fileReferences: input.fileUrls.map((url) => ({ url })),
	});
};

// ─── Validate Logic ───────────────────────────────────────────────────────────

export type ValidationResult = {
	status: "VALIDATED" | "VALIDATION_FAILED" | "PARTIALLY_VALIDATED";
	validCount?: number;
	invalidCount?: number;
	errors?: Array<{ studentId: number; field: string; reason: string }>;
	readyForPublish?: boolean;
	workflowRunId?: string;
};

export const validateLogic = async (
	context: MastraToolContext,
	input: z.infer<typeof validateSchema>
): Promise<ValidationResult> => {
	const { tenantContext, getService, mastra } = context;

	if (!tenantContext.examId) {
		return {
			status: "VALIDATION_FAILED",
			errors: [{ studentId: 0, field: "examId", reason: "MISSING_EXAM_CONTEXT: No active exam selected." }]
		};
	}

	const service = getService(AssessmentService) as AssessmentService & {
		validateExtractionForTool: (params: unknown) => Promise<ValidationResult>;
	};

	return service.validateExtractionForTool({
		provider: contextProvider(context),
		mastra,
		workflowRunId: input.workflowRunId,
		studentIds: input.studentIds,
	});
};

// ─── Publish Logic ────────────────────────────────────────────────────────────

export type PublishResult = {
	status: "PUBLISH_STARTED" | "PUBLISH_COMPLETE" | "PUBLISH_FAILED";
	pdfCount?: number;
	emailCount?: number;
	errors?: string[];
	workflowRunId?: string;
};

export const publishLogic = async (
	context: MastraToolContext,
	input: z.infer<typeof publishSchema>
): Promise<PublishResult> => {
	const { tenantContext, getService, mastra } = context;

	if (!tenantContext.examId) {
		return {
			status: "PUBLISH_FAILED",
			errors: ["No active exam context. Cannot publish results without an exam selection."]
		};
	}

	if (input.scope === "student" && !input.studentId) {
		return {
			status: "PUBLISH_FAILED",
			errors: ["Student ID is required when scope is 'student'."]
		};
	}

	const service = getService(AssessmentService) as AssessmentService & {
		publishResultsForTool: (params: unknown) => Promise<PublishResult>;
	};

	return service.publishResultsForTool({
		provider: contextProvider(context),
		mastra,
		scope: input.scope,
		studentId: input.studentId,
		generatePdf: input.generatePdf,
		sendEmail: input.sendEmail,
	});
};

// ─── Generate Logic (B12) ─────────────────────────────────────────────────────

export type GenerationResult = {
	status: "GENERATION_STARTED" | "GENERATION_COMPLETE" | "GENERATION_FAILED";
	workflowRunId?: string;
	fileCount?: number;
	errors?: string[];
};

export const generateLogic = async (
	context: MastraToolContext,
	input: z.infer<typeof generateSchema>
): Promise<GenerationResult> => {
	const { tenantContext, getService, mastra } = context;

	const classId = input.classId ?? tenantContext.classId;
	const sectionId = input.sectionId ?? tenantContext.sectionId;
	const staffId = input.staffId ?? tenantContext.staffId;

	if (!classId || !sectionId) {
		return {
			status: "GENERATION_FAILED",
			errors: ["No active class/section context. /generate requires an active class+section selection."]
		};
	}

	const service = getService(AssessmentService) as AssessmentService & {
		runGenerateForTool: (params: unknown) => Promise<GenerationResult>;
	};

	return service.runGenerateForTool({
		provider: contextProvider(context),
		mastra,
		fileIds: input.fileIds,
		classId,
		sectionId,
		staffId,
	});
};

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Pull a `ScopedRepositoryProvider` out of the context. The `*ForTool`
 * methods need it to resolve the active schoolId for the workflow's
 * tenantContext payload. In tests the context provides a `getProvider`
 * accessor; in production `buildMastraToolContext` exposes the same
 * accessor. Falls back to undefined if the context was hand-built
 * without a provider — the *ForTool method will then throw.
 */
function contextProvider(context: MastraToolContext) {
	if (typeof (context as { getProvider?: () => unknown }).getProvider === "function") {
		return (context as { getProvider: () => unknown }).getProvider() as never;
	}
	throw new Error(
		"No ScopedRepositoryProvider reachable from MastraToolContext. " +
		"buildMastraToolContext() must attach a getProvider() accessor for workflow tools.",
	);
}
