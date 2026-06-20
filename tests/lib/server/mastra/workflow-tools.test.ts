import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({
	env: {
		DATABASE_URL: "mysql://test@localhost:3306/test",
		LIBSQL_URL: "file:tests/.tmp/test.db",
		LIBSQL_AUTH_TOKEN: "test",
	},
}));

vi.mock("$env/dynamic/public", () => ({
	env: { PUBLIC_APP_NAME: "Test" },
}));

vi.mock("$app/server", () => ({
	getRequestEvent: () => ({}),
}));

vi.mock("$app/environment", () => ({
	dev: true,
	browser: false,
}));

vi.mock("$lib/components/template/ResultTemplate.svelte", () => ({
	default: {},
}));

vi.mock("$lib/components/template/result-email.svelte", () => ({
	default: {},
}));

const { mockMastra, mockProvider, mockService } = vi.hoisted(() => {
	const mockMastra = {
		getWorkflow: vi.fn().mockReturnValue({
			streamVNext: vi.fn().mockResolvedValue({ runId: "wf_test_run_1" }),
		}),
	};
	const mockProvider = {
		getTenant: () => ({
			schoolId: 1,
			userId: 7,
			staffId: 99,
			designationId: 8,
			classId: 3,
			sectionId: 1,
			examId: 5,
			academicId: 2026,
			roleId: 2,
		}),
		getDb: () => ({ __isDbStub: true }),
		getRepo: vi.fn(),
		getService: vi.fn(),
	};
	const mockService = {
		runExtractionForTool: vi.fn(),
		runGenerateForTool: vi.fn(),
		validateExtractionForTool: vi.fn(),
		publishResultsForTool: vi.fn(),
	};
	return { mockMastra, mockProvider, mockService };
});

vi.mock("$lib/server/db", () => ({
	getDatabase: vi.fn().mockResolvedValue({ __isDbStub: true }),
}));

vi.mock("$lib/server/repository", () => ({
	studentRepo: { __name: "StudentRepository" },
	resultRepo: { __name: "ResultsRepository" },
	timelineRepo: { __name: "TimelineRepository" },
	staffRepo: { __name: "StaffRepository" },
	StudentRepository: class {},
	ResultsRepository: class {},
	TimelineRepository: class {},
	StaffRepository: class {},
	BaseRepository: class {},
	AuthRepository: class {},
	JobRepository: class {},
	ParentRepository: class {},
}));

vi.mock("$lib/server/service/assessment.service", () => ({
	AssessmentService: class {
		constructor() {}
	},
}));

import {
	extractLogic,
	validateLogic,
	publishLogic,
	generateLogic,
	extractSchema,
	validateSchema,
	publishSchema,
	generateSchema,
} from "$lib/server/mastra/tools/operations/reporting/workflow-tools";
import { extractTool, validateTool, publishTool, generateTool, workflowTools } from "$lib/server/mastra/tools";
import { createTenantContext, type MastraToolContext } from "$lib/server/mastra/tenant-context";
import { AssessmentService } from "$lib/server/service/assessment.service";

function makeContext(overrides?: Partial<MastraToolContext>): MastraToolContext {
	const tenant = createTenantContext({
		schoolId: 1,
		userId: 7,
		staffId: 99,
		designationId: 8,
		classId: 3,
		sectionId: 1,
		examId: 5,
		academicId: 2026,
		roleId: 2,
	});

	mockService.runExtractionForTool.mockReset();
	mockService.runGenerateForTool.mockReset();
	mockService.validateExtractionForTool.mockReset();
	mockService.publishResultsForTool.mockReset();

	mockService.runExtractionForTool.mockResolvedValue({
		status: "EXTRACTION_STARTED",
		workflowRunId: "wf_extract_1",
		extractedCount: 1,
	});
	mockService.runGenerateForTool.mockResolvedValue({
		status: "GENERATION_STARTED",
		workflowRunId: "wf_generate_1",
		fileCount: 1,
	});
	mockService.validateExtractionForTool.mockResolvedValue({
		status: "VALIDATED",
		validCount: 0,
		invalidCount: 0,
		readyForPublish: true,
	});
	mockService.publishResultsForTool.mockResolvedValue({
		status: "PUBLISH_STARTED",
		pdfCount: 0,
		emailCount: 0,
	});

	return {
		tenantContext: tenant,
		getRepo: vi.fn(),
		getService: vi.fn().mockReturnValue(mockService),
		getProvider: () => mockProvider as unknown as ReturnType<NonNullable<MastraToolContext["getProvider"]>>,
		audit: { threadId: "t1", modelId: "m1" },
		mastra: mockMastra,
		...overrides,
	};
}

describe("Slice 2 — workflow tool wiring (B3, B12)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("extractLogic", () => {
		it("calls runExtractionForTool with mapped tenant fields", async () => {
			const ctx = makeContext();
			await extractLogic(ctx, {
				fileUrls: ["https://example.com/file1.png"],
				targetType: "marks",
			});

			expect(mockService.runExtractionForTool).toHaveBeenCalledTimes(1);
			const call = mockService.runExtractionForTool.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(call).toMatchObject({
				userId: 7,
				teacherId: 99,
				classId: 3,
				sectionId: 1,
				mastra: mockMastra,
			});
			expect(call.fileReferences).toEqual([{ url: "https://example.com/file1.png" }]);
		});

		it("input.classId override beats tenantContext.classId", async () => {
			const ctx = makeContext();
			await extractLogic(ctx, {
				fileUrls: ["https://example.com/x.png"],
				classId: 99,
				sectionId: 7,
				targetType: "marks",
			});
			const call = mockService.runExtractionForTool.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(call.classId).toBe(99);
			expect(call.sectionId).toBe(7);
		});

		it("returns EXTRACTION_FAILED when classId/sectionId are missing", async () => {
			const ctx = makeContext({
				tenantContext: createTenantContext({
					schoolId: 1,
					userId: 7,
					staffId: 99,
					designationId: 8,
					classId: null,
					sectionId: null,
					examId: 5,
					academicId: 2026,
					roleId: 2,
				}),
			});
			const result = await extractLogic(ctx, {
				fileUrls: ["https://example.com/x.png"],
				targetType: "marks",
			});
			expect(result.status).toBe("EXTRACTION_FAILED");
			expect(mockService.runExtractionForTool).not.toHaveBeenCalled();
		});
	});

	describe("validateLogic", () => {
		it("calls validateExtractionForTool with the workflowRunId and studentIds", async () => {
			const ctx = makeContext();
			await validateLogic(ctx, {
				workflowRunId: "wf_extract_1",
				studentIds: [10, 20, 30],
			});

			expect(mockService.validateExtractionForTool).toHaveBeenCalledTimes(1);
			const call = mockService.validateExtractionForTool.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(call).toMatchObject({
				workflowRunId: "wf_extract_1",
				studentIds: [10, 20, 30],
				mastra: mockMastra,
			});
		});

		it("returns VALIDATION_FAILED with MISSING_EXAM_CONTEXT when examId is null", async () => {
			const ctx = makeContext({
				tenantContext: createTenantContext({
					schoolId: 1,
					userId: 7,
					staffId: 99,
					designationId: 8,
					classId: 3,
					sectionId: 1,
					examId: null,
					academicId: 2026,
					roleId: 2,
				}),
			});
			const result = await validateLogic(ctx, { workflowRunId: "wf_1" });
			expect(result.status).toBe("VALIDATION_FAILED");
			expect(result.errors?.[0]?.reason).toContain("MISSING_EXAM_CONTEXT");
		});
	});

	describe("publishLogic", () => {
		it("calls publishResultsForTool with scope=all", async () => {
			const ctx = makeContext();
			await publishLogic(ctx, { scope: "all", generatePdf: true, sendEmail: false });
			expect(mockService.publishResultsForTool).toHaveBeenCalledTimes(1);
			const call = mockService.publishResultsForTool.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(call).toMatchObject({
				scope: "all",
				generatePdf: true,
				sendEmail: false,
				mastra: mockMastra,
			});
		});

		it("calls publishResultsForTool with scope=student and studentId", async () => {
			const ctx = makeContext();
			await publishLogic(ctx, { scope: "student", studentId: 42, generatePdf: true, sendEmail: true });
			const call = mockService.publishResultsForTool.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(call).toMatchObject({ scope: "student", studentId: 42 });
		});

		it("returns PUBLISH_FAILED when scope=student but studentId missing", async () => {
			const ctx = makeContext();
			const result = await publishLogic(ctx, { scope: "student", generatePdf: true, sendEmail: true });
			expect(result.status).toBe("PUBLISH_FAILED");
		});

		it("returns PUBLISH_FAILED when examId is null", async () => {
			const ctx = makeContext({
				tenantContext: createTenantContext({
					schoolId: 1,
					userId: 7,
					staffId: 99,
					designationId: 8,
					classId: 3,
					sectionId: 1,
					examId: null,
					academicId: 2026,
					roleId: 2,
				}),
			});
			const result = await publishLogic(ctx, { scope: "all", generatePdf: true, sendEmail: true });
			expect(result.status).toBe("PUBLISH_FAILED");
		});
	});

	describe("generateLogic (B12)", () => {
		it("calls runGenerateForTool with fileIds and tenant fields", async () => {
			const ctx = makeContext();
			await generateLogic(ctx, {
				fileIds: ["file_a", "file_b"],
				classId: 5,
				sectionId: 2,
				staffId: 77,
			});

			expect(mockService.runGenerateForTool).toHaveBeenCalledTimes(1);
			const call = mockService.runGenerateForTool.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(call).toMatchObject({
				fileIds: ["file_a", "file_b"],
				classId: 5,
				sectionId: 2,
				staffId: 77,
				mastra: mockMastra,
			});
		});

		it("falls back to tenantContext.staffId when input.staffId is omitted", async () => {
			const ctx = makeContext();
			await generateLogic(ctx, {
				fileIds: ["file_a"],
				classId: 3,
				sectionId: 1,
			});
			const call = mockService.runGenerateForTool.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(call.staffId).toBe(99);
		});
	});

	describe("tool wiring (tools/index.ts)", () => {
		it("generateTool.id === 'generate-results' (matches generateWorkflow's id)", () => {
			expect(generateTool.id).toBe("generate-results");
		});

		it("generateTool is exported in the workflowTools aggregate", () => {
			expect(workflowTools.generateTool).toBe(generateTool);
		});

		it("extractTool, validateTool, publishTool are still exported", () => {
			expect(extractTool.id).toBe("extract-document");
			expect(validateTool.id).toBe("validate-extraction");
			expect(publishTool.id).toBe("publish-results");
		});

		it("inputSchema matches the zod schemas (introspection check)", () => {
			const extractFields = Object.keys((extractSchema as { shape: Record<string, unknown> }).shape);
			const validateFields = Object.keys((validateSchema as { shape: Record<string, unknown> }).shape);
			const publishFields = Object.keys((publishSchema as { shape: Record<string, unknown> }).shape);
			const generateFields = Object.keys((generateSchema as { shape: Record<string, unknown> }).shape);
			expect(extractFields).toContain("fileUrls");
			expect(validateFields).toContain("workflowRunId");
			expect(publishFields).toContain("scope");
			expect(generateFields).toEqual(expect.arrayContaining(["fileIds", "classId", "sectionId"]));
		});
	});

	describe("AssessmentService mock is invoked via getService", () => {
		it("getService(AssessmentService) is what each *Logic function uses", async () => {
			const ctx = makeContext();
			await extractLogic(ctx, { fileUrls: ["https://x.com/y.png"], targetType: "marks" });
			expect(ctx.getService).toHaveBeenCalledWith(AssessmentService);
		});
	});
});
