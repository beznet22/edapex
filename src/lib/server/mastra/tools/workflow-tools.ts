import { z } from "zod";
import type { TenantContext, MastraToolContext } from "../tenant-context";

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
	const { tenantContext } = context;
	const classId = input.classId ?? tenantContext.classId;
	const sectionId = input.sectionId ?? tenantContext.sectionId;

	if (!classId || !sectionId) {
		return {
			status: "EXTRACTION_FAILED",
			errors: ["No active class/section context. Please select a class before extracting."]
		};
	}

	// Generate a workflow run ID for tracking
	const workflowRunId = `wf_extract_${Date.now()}_${classId}_${sectionId}`;

	// In the full implementation, this dispatches to:
	// - Instant path (< 4 files): Direct OCR via Mistral
	// - Batch path (≥ 4 files): Worker thread dispatch
	// For now, return the staging state for the Gateway to manage
	return {
		status: "EXTRACTION_STARTED",
		workflowRunId,
		extractedCount: input.fileUrls.length,
	};
};

// ─── Validate Logic ───────────────────────────────────────────────────────────

export type ValidationResult = {
	status: "VALIDATED" | "VALIDATION_FAILED" | "PARTIALLY_VALIDATED";
	validCount?: number;
	invalidCount?: number;
	errors?: Array<{ studentId: number; field: string; reason: string }>;
	readyForPublish?: boolean;
};

export const validateLogic = async (
	context: MastraToolContext,
	input: z.infer<typeof validateSchema>
): Promise<ValidationResult> => {
	const { tenantContext } = context;

	if (!tenantContext.examId) {
		return {
			status: "VALIDATION_FAILED",
			errors: [{ studentId: 0, field: "examId", reason: "MISSING_EXAM_CONTEXT: No active exam selected." }]
		};
	}

	// In the full implementation, this resumes the suspended Mastra Workflow:
	// 1. validateSchema — checks OCR state against resultInputSchema
	// 2. applyBusinessLogic — calculates grades, GPAs, attendance formatting
	// 3. commitToDB — atomic write via TenantContext
	return {
		status: "VALIDATED",
		validCount: 0,
		invalidCount: 0,
		readyForPublish: true,
	};
};

// ─── Publish Logic ────────────────────────────────────────────────────────────

export type PublishResult = {
	status: "PUBLISH_STARTED" | "PUBLISH_COMPLETE" | "PUBLISH_FAILED";
	pdfCount?: number;
	emailCount?: number;
	errors?: string[];
};

export const publishLogic = async (
	context: MastraToolContext,
	input: z.infer<typeof publishSchema>
): Promise<PublishResult> => {
	const { tenantContext } = context;

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

	// In the full implementation, this dispatches to worker_threads:
	// 1. generatePDFs — PrinceXML binary execution off main thread
	// 2. dispatchEmails — SMTP job dispatch
	// 3. auditTimeline — inject timeline events
	return {
		status: "PUBLISH_STARTED",
		pdfCount: 0,
		emailCount: 0,
	};
};
