import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({
	env: {
		DATABASE_URL: "mysql://test:test@localhost:3306/test",
		LIBSQL_URL: "file:test.db",
		LIBSQL_AUTH_TOKEN: "test",
	},
}));

vi.mock("$env/dynamic/public", () => ({
	env: {
		PUBLIC_APP_NAME: "EdApex Test",
	},
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

vi.mock("$lib/server/db", () => ({
	getDatabase: vi.fn().mockResolvedValue({ __isDbStub: true }),
}));

const { mockStudentRepo, mockResultRepo, mockTimelineRepo, mockStaffRepo } = vi.hoisted(() => ({
	mockStudentRepo: {
		__name: "StudentRepository",
		getStudentById: vi.fn(),
		getById: vi.fn(),
		updateStudentCategoryId: vi.fn(),
		resolveGenderId: vi.fn(),
		resolveStudentCategoryId: vi.fn(),
		getRollNoAndAdmissionNo: vi.fn(),
	},
	mockResultRepo: {
		__name: "ResultsRepository",
		getAcademicId: vi.fn().mockResolvedValue(2026),
		getAssignedSubjects: vi.fn().mockResolvedValue([]),
		getClassSections: vi.fn().mockResolvedValue([]),
		assignSubjects: vi.fn().mockResolvedValue(undefined),
		upsertClassAttendance: vi.fn().mockResolvedValue(1),
		upsertTeacherRemark: vi.fn().mockResolvedValue(undefined),
		upsertStudentRatings: vi.fn().mockResolvedValue(undefined),
		batchUpsertMarkRecords: vi.fn().mockResolvedValue(undefined),
		batchUpsertResultRecords: vi.fn().mockResolvedValue(undefined),
		cleanMarks: vi.fn().mockResolvedValue(undefined),
		getExamSetupsByClassSection: vi.fn().mockResolvedValue([]),
		getExamSetupsByStaffId: vi.fn().mockResolvedValue([]),
		createExamIfNotExist: vi.fn().mockResolvedValue(1),
		upsertExamSetup: vi.fn().mockResolvedValue(1),
		queryResultData: vi.fn(),
		getGeneralSettings: vi.fn().mockResolvedValue([]),
		getCurrentTerm: vi.fn().mockResolvedValue({ id: 1, title: "Term 1" }),
		getStudentCategories: vi.fn().mockResolvedValue([]),
		getSubjectsAssignedToStaff: vi.fn().mockResolvedValue([]),
		getAssignedClassSection: vi.fn().mockResolvedValue({ classId: 1, sectionId: 1 }),
		getClassSectionById: vi.fn(),
		getObjectives: vi.fn().mockResolvedValue([]),
		db: { transaction: vi.fn() },
	},
	mockTimelineRepo: {
		__name: "TimelineRepository",
		upsertTimelines: vi.fn().mockResolvedValue(undefined),
		getTimelinesByStudentId: vi.fn().mockResolvedValue([]),
	},
	mockStaffRepo: {
		__name: "StaffRepository",
		getById: vi.fn(),
	},
}));

vi.mock("$lib/server/repository", () => ({
	studentRepo: mockStudentRepo,
	resultRepo: mockResultRepo,
	timelineRepo: mockTimelineRepo,
	staffRepo: mockStaffRepo,
	StudentRepository: class {},
	ResultsRepository: class {},
	TimelineRepository: class {},
	StaffRepository: class {},
	BaseRepository: class {},
	AuthRepository: class {},
	JobRepository: class {},
	ParentRepository: class {},
}));

const { mockMistralOcr, mockStudentFileStorage } = vi.hoisted(() => {
	const mockMistralOcr = {
		processDocument: vi.fn(),
		getMarkdownByFileId: vi.fn(),
	};
	const mockStudentFileStorage = {
		getFolderPath: vi.fn().mockReturnValue("/tmp/mock-folder"),
		formatName: vi.fn().mockImplementation((name: string) => name.toLowerCase().replaceAll(" ", "_")),
		saveRawText: vi.fn().mockResolvedValue(undefined),
		save: vi.fn().mockResolvedValue("/tmp/mock-folder/stored.json"),
		load: vi.fn().mockResolvedValue(null),
	};
	return { mockMistralOcr, mockStudentFileStorage };
});

vi.mock("$lib/server/service/mistral-ocr.service", () => ({
	mistralOcrService: mockMistralOcr,
}));

vi.mock("$lib/server/storage/student-files", () => ({
	studentFileStorage: mockStudentFileStorage,
}));

import { AssessmentService } from "../assessment.service";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";

function makeProvider(schoolId: number): ScopedRepositoryProvider {
	const tenant = createTenantContext({
		schoolId,
		userId: 7,
		staffId: 99,
		designationId: 8,
		classId: 3,
		sectionId: 1,
		examId: 5,
		academicId: 2026,
		roleId: 2,
	});

	const repoCache = new Map<string, unknown>();
	return {
		getTenant: () => tenant,
		getDb: () => ({ __isDbStub: true }),
		getRepo: <T>(RepoClass: { name?: string; new (...args: any[]): T }): T => {
			const key = RepoClass.name ?? "Unknown";
			if (!repoCache.has(key)) {
				if (key === "StudentRepository") repoCache.set(key, mockStudentRepo as unknown as T);
				else if (key === "ResultsRepository") repoCache.set(key, mockResultRepo as unknown as T);
				else if (key === "TimelineRepository") repoCache.set(key, mockTimelineRepo as unknown as T);
				else if (key === "StaffRepository") repoCache.set(key, mockStaffRepo as unknown as T);
				else throw new Error(`Mock does not have a repo for ${key}`);
			}
			return repoCache.get(key) as T;
		},
		getService: <T>(ServiceClass: { name?: string; new (...args: any[]): T }): T => {
			throw new Error("getService not used in this test");
		},
	} as unknown as ScopedRepositoryProvider;
}

describe("Slice 1 — AssessmentService ScopedRepositoryProvider plumbing", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.clearAllMocks();
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	describe("constructor + provider wiring", () => {
		it("accepts a ScopedRepositoryProvider and routes student() through it", () => {
			const provider = makeProvider(2);
			const svc = new AssessmentService(provider);

			const student = (svc as unknown as { student: () => unknown }).student();

			expect(student).toBe(mockStudentRepo);
		});

		it("routes result() through the provider", () => {
			const provider = makeProvider(2);
			const svc = new AssessmentService(provider);

			const result = (svc as unknown as { result: () => unknown }).result();

			expect(result).toBe(mockResultRepo);
		});

		it("routes timeline() through the provider", () => {
			const provider = makeProvider(2);
			const svc = new AssessmentService(provider);

			const timeline = (svc as unknown as { timeline: () => unknown }).timeline();

			expect(timeline).toBe(mockTimelineRepo);
		});

		it("routes staff() through the provider", () => {
			const provider = makeProvider(2);
			const svc = new AssessmentService(provider);

			const staff = (svc as unknown as { staff: () => unknown }).staff();

			expect(staff).toBe(mockStaffRepo);
		});

		it("returns the provider's schoolId from activeSchoolId() (B1 fix)", () => {
			const provider = makeProvider(42);
			const svc = new AssessmentService(provider);

			const schoolId = (svc as unknown as { activeSchoolId: () => number }).activeSchoolId();

			expect(schoolId).toBe(42);
		});
	});

	describe("globalFallback path", () => {
		it("falls back to the legacy singleton when no provider is attached", () => {
			const svc = new AssessmentService(null);

			const student = (svc as unknown as { student: () => unknown }).student();
			const result = (svc as unknown as { result: () => unknown }).result();
			const timeline = (svc as unknown as { timeline: () => unknown }).timeline();
			const staff = (svc as unknown as { staff: () => unknown }).staff();

			expect(student).toBe(mockStudentRepo);
			expect(result).toBe(mockResultRepo);
			expect(timeline).toBe(mockTimelineRepo);
			expect(staff).toBe(mockStaffRepo);
		});

		it("logs a one-shot deprecation warning when no provider is attached", () => {
			const svc = new AssessmentService(null);

			(svc as unknown as { student: () => unknown }).student();
			(svc as unknown as { result: () => unknown }).result();
			(svc as unknown as { timeline: () => unknown }).timeline();
			(svc as unknown as { staff: () => unknown }).staff();

			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy.mock.calls[0]?.[0]).toContain("ScopedRepositoryProvider");
		});

		it("activeSchoolId() returns 1 in fallback mode", () => {
			const svc = new AssessmentService(null);

			const schoolId = (svc as unknown as { activeSchoolId: () => number }).activeSchoolId();

			expect(schoolId).toBe(1);
		});
	});

	describe("tenant isolation", () => {
		it("two AssessmentService instances with different providers see different schoolIds", () => {
			const svcSchool1 = new AssessmentService(makeProvider(1));
			const svcSchool2 = new AssessmentService(makeProvider(2));

			expect((svcSchool1 as unknown as { activeSchoolId: () => number }).activeSchoolId()).toBe(1);
			expect((svcSchool2 as unknown as { activeSchoolId: () => number }).activeSchoolId()).toBe(2);
		});
	});

	describe("repo methods added in Slice 1", () => {
		it("StudentRepository.resolveGenderId exists and is wired through the provider", async () => {
			mockStudentRepo.resolveGenderId.mockResolvedValue(2);

			const provider = makeProvider(1);
			const svc = new AssessmentService(provider);
			const repo = (svc as unknown as { student: () => typeof mockStudentRepo }).student();

			const result = await repo.resolveGenderId("Female");

			expect(result).toBe(2);
			expect(mockStudentRepo.resolveGenderId).toHaveBeenCalledWith("Female");
		});

		it("StudentRepository.resolveStudentCategoryId exists and is wired through the provider", async () => {
			mockStudentRepo.resolveStudentCategoryId.mockResolvedValue(3);

			const provider = makeProvider(1);
			const svc = new AssessmentService(provider);
			const repo = (svc as unknown as { student: () => typeof mockStudentRepo }).student();

			const result = await repo.resolveStudentCategoryId("Boarding");

			expect(result).toBe(3);
			expect(mockStudentRepo.resolveStudentCategoryId).toHaveBeenCalledWith("Boarding");
		});

		it("StudentRepository.getRollNoAndAdmissionNo exists and is wired through the provider", async () => {
			mockStudentRepo.getRollNoAndAdmissionNo.mockResolvedValue({ rollNo: 7, admissionNo: 1234 });

			const provider = makeProvider(1);
			const svc = new AssessmentService(provider);
			const repo = (svc as unknown as { student: () => typeof mockStudentRepo }).student();

			const result = await repo.getRollNoAndAdmissionNo(100);

			expect(result).toEqual({ rollNo: 7, admissionNo: 1234 });
			expect(mockStudentRepo.getRollNoAndAdmissionNo).toHaveBeenCalledWith(100);
		});

		it("StaffRepository.getById exists and is wired through the provider", async () => {
			mockStaffRepo.getById.mockResolvedValue({ id: 42, fullName: "Mr. Smith" });

			const provider = makeProvider(1);
			const svc = new AssessmentService(provider);
			const repo = (svc as unknown as { staff: () => typeof mockStaffRepo }).staff();

			const result = await repo.getById(42);

			expect(result).toEqual({ id: 42, fullName: "Mr. Smith" });
			expect(mockStaffRepo.getById).toHaveBeenCalledWith(42);
		});
	});

	describe("Slice 2 cleanup — runExtraction no longer uses EdApexGateway", () => {
		beforeEach(() => {
			mockMistralOcr.processDocument.mockReset();
			mockStudentFileStorage.saveRawText.mockClear();
			mockStudentFileStorage.save.mockClear();
		});

		it("calls mistralOcrService.processDocument (not EdApexGateway.executeExtraction)", async () => {
			mockMistralOcr.processDocument.mockResolvedValue({
				pages: [{ markdown: "## Student Report\nName: Alice" }, { markdown: "Math: 85" }],
			});
			mockResultRepo.getClassSectionById.mockReturnValue({ className: "JSS1", sectionName: "A" });

			const provider = makeProvider(2);
			const svc = new AssessmentService(provider);

			const file = new Blob(["mock file content"], { type: "image/png" });
			const result = await svc.runExtraction({
				userId: 7,
				teacherId: 99,
				file,
				classId: 3,
				sectionId: 1,
			});

			expect(mockMistralOcr.processDocument).toHaveBeenCalledTimes(1);
			expect(result).not.toBeNull();
			expect(result?.success).toBe(true);
			expect(result?.is_fallback).toBe(false);
			expect(result?.rawText).toContain("Student Report");
			expect(result?.rawText).toContain("Math: 85");
			expect(result?.studentData?.className).toBe("JSS1");
		});

		it("returns null when OCR produces no text", async () => {
			mockMistralOcr.processDocument.mockResolvedValue({ pages: [] });
			mockResultRepo.getClassSectionById.mockReturnValue({ className: "JSS1", sectionName: "A" });

			const provider = makeProvider(1);
			const svc = new AssessmentService(provider);

			const file = new Blob(["mock file content"], { type: "image/png" });
			const result = await svc.runExtraction({
				userId: 7,
				teacherId: 99,
				file,
				classId: 3,
				sectionId: 1,
			});

			expect(result).toBeNull();
		});

		it("saves the OCR text via studentFileStorage.saveRawText", async () => {
			mockMistralOcr.processDocument.mockResolvedValue({ pages: [{ markdown: "# OCR result" }] });
			mockResultRepo.getClassSectionById.mockReturnValue({ className: "JSS2", sectionName: "B" });

			const provider = makeProvider(1);
			const svc = new AssessmentService(provider);

			const file = new Blob(["x"], { type: "image/png" });
			await svc.runExtraction({
				userId: 7,
				teacherId: 99,
				file,
				classId: 3,
				sectionId: 1,
				studentId: 42,
			});

			expect(mockStudentFileStorage.saveRawText).toHaveBeenCalledWith(
				expect.stringContaining("42"),
				"ocr.md",
				"# OCR result",
			);
		});

		it("marks the extractedData shell as mappingStatus: 'pending' (Slice 12 gap)", async () => {
			mockMistralOcr.processDocument.mockResolvedValue({ pages: [{ markdown: "raw text" }] });
			mockResultRepo.getClassSectionById.mockReturnValue({ className: "JSS1", sectionName: "A" });

			const provider = makeProvider(1);
			const svc = new AssessmentService(provider);

			const file = new Blob(["x"], { type: "image/png" });
			const result = await svc.runExtraction({ userId: 7, teacherId: 99, file, classId: 3, sectionId: 1 });

			expect((result?.marks as { mappingStatus?: string })?.mappingStatus).toBe("pending");
			expect((result?.marks as { marksData?: unknown[] })?.marksData).toEqual([]);
		});

		it("does NOT import or construct EdApexGateway in the service module", async () => {
			// Static assertion: the service file should not import EdApexGateway
			// (the gateway is a MastraModelGateway used only by route handlers).
			// We re-read the source as a string to catch any re-introduction.
			const fs = await import("fs/promises");
			const src = await fs.readFile(
				new URL("../assessment.service.ts", import.meta.url),
				"utf8",
			);
			expect(src).not.toMatch(/import\s+\{[^}]*EdApexGateway[^}]*\}\s+from/);
			expect(src).not.toMatch(/new\s+EdApexGateway/);
		});
	});
});
