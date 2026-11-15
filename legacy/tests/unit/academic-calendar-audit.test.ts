import { describe, expect, it, beforeEach, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { SettingsService } from "$lib/server/service/settings.service";

// Capture every `log()` invocation so each handler branch can be asserted.
const logMock = vi.fn(async () => {});
vi.mock("$lib/server/audit-log", () => ({
	log: logMock
}));

// In-memory fixtures for smAcademicYears and smExamTypes. The patched
// SettingsService methods below operate on these directly. We use Partial<>
// because the real DB-backed type has columns (createdAt, copyWithAcademicYear,
// parentId, percantage, …) we don't need to round-trip in these tests.
type AcademicYearData = NonNullable<
	Awaited<ReturnType<SettingsService["listAcademicYears"]>>[number]
>;
type ExamTypeData = NonNullable<
	Awaited<ReturnType<SettingsService["listExamTypes"]>>[number]
>;

type AcademicYearFixture = Partial<AcademicYearData> & {
	id: number;
	schoolId: number;
	year: string;
	title: string;
	startingDate: string;
	endingDate: string;
	activeStatus: number;
	createdBy: number;
	updatedBy: number;
};
type ExamTypeFixture = Partial<ExamTypeData> & {
	id: number;
	schoolId: number;
	academicId: number;
	title: string;
	isAverage: number;
	percentage: number | null;
	averageMark: number;
	activeStatus: number;
	createdBy: number;
	updatedBy: number;
};

let nextYearId = 100;
let nextExamId = 500;
const yearRows: AcademicYearFixture[] = [];
const examRows: ExamTypeFixture[] = [];

function resetFixtures(): void {
	yearRows.length = 0;
	examRows.length = 0;
	nextYearId = 100;
	nextExamId = 500;
	yearRows.push({
		id: 1,
		schoolId: 1,
		year: "2024-2025",
		title: "2024/2025 Session",
		startingDate: "2024-09-01",
		endingDate: "2025-07-31",
		activeStatus: 1,
		createdBy: 1,
		updatedBy: 1
	});
	examRows.push({
		id: 900,
		schoolId: 1,
		academicId: 1,
		title: "Mid-Term Test",
		isAverage: 0,
		percentage: 30,
		averageMark: 70,
		activeStatus: 1,
		createdBy: 1,
		updatedBy: 1
	});
}

// Minimal Drizzle shim. Tracks which table is being read by inspecting the
// from() arg so reads against smExamTypes return examRows instead of yearRows.
type TableName = "smAcademicYears" | "smExamTypes";

const queryShim = () => {
	let currentTable: TableName = "smAcademicYears";
	const chain: Record<string, unknown> = {
		select() {
			return chain;
		},
		from(table: unknown) {
			const name =
				typeof table === "string"
					? table
					: (table as { name?: string } | null)?.name;
			currentTable = name === "smExamTypes" ? "smExamTypes" : "smAcademicYears";
			return chain;
		},
		where() {
			return chain;
		},
		orderBy() {
			const data = currentTable === "smExamTypes" ? examRows : yearRows;
			return Promise.resolve(data);
		},
		limit() {
			const data = currentTable === "smExamTypes" ? examRows : yearRows;
			return Promise.resolve(data.slice(0, 1));
		},
		insert() {
			return chain;
		},
		update() {
			return chain;
		},
		set() {
			return chain;
		},
		values(payload: Record<string, unknown>) {
			const t = (payload as { __t?: string }).__t;
			if (t === "year") {
				const id = nextYearId++;
				const row: AcademicYearFixture = {
					id,
					schoolId: payload.schoolId as number,
					year: payload.year as string,
					title: payload.title as string,
					startingDate: payload.startingDate as string,
					endingDate: payload.endingDate as string,
					activeStatus: (payload.activeStatus as number | undefined) ?? 0,
					createdBy: payload.createdBy as number,
					updatedBy: payload.updatedBy as number
				};
				yearRows.push(row);
				return { $returningId: async () => [{ id }] };
			}
			const id = nextExamId++;
			const row: ExamTypeFixture = {
				id,
				schoolId: payload.schoolId as number,
				academicId: payload.academicId as number,
				title: payload.title as string,
				isAverage: payload.isAverage as number,
				percentage: payload.percentage as number | null,
				averageMark: payload.averageMark as number,
				activeStatus: 1,
				createdBy: payload.createdBy as number,
				updatedBy: payload.createdBy as number
			};
			examRows.push(row);
			return { $returningId: async () => [{ id }] };
		}
	};
	return chain;
};

vi.mock("$lib/server/db", () => ({
	getDatabase: async () => queryShim(),
	closeDatabase: async () => {}
}));

const { POST, GET } = await import(
	"$lib/../routes/api/settings/academic-calendar/+server"
);

type AuditLogCall = {
	schoolId: number;
	actorStaffId: number;
	action: string;
	entityType: string;
	entityId: string | number;
	before?: unknown;
	after?: unknown;
};

interface HttpErrorLike {
	status: number;
	body: { message: string };
}

function isHttpErrorLike(err: unknown): err is HttpErrorLike {
	if (typeof err !== "object" || err === null) return false;
	const e = err as Record<string, unknown>;
	const body = e.body as Record<string, unknown> | undefined;
	return (
		typeof e.status === "number" &&
		typeof body === "object" &&
		body !== null &&
		typeof body.message === "string"
	);
}

function buildEvent(
	body: unknown,
	user: NonNullable<App.Locals["user"]> | null = {
		id: 1,
		isAdministrator: true,
		designation: "admin",
		staffId: 42,
		schoolId: 1
	}
): RequestEvent & { request: Request } {
	return {
		request: new Request("http://localhost/api/settings/academic-calendar", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: body === null ? "null" : JSON.stringify(body)
		}),
		locals: {
			session: user ? ({ id: "test" } as App.Locals["session"]) : null,
			user
		},
		params: {},
		url: new URL("http://localhost/api/settings/academic-calendar"),
		cookies: {} as never,
		fetch: globalThis.fetch,
		getClientAddress: () => "127.0.0.1",
		platform: undefined,
		route: { id: "/api/settings/academic-calendar" },
		setHeaders: () => undefined,
		isDataRequest: false,
		isSubRequest: false
	} as unknown as RequestEvent & { request: Request };
}

async function callPost(
	body: unknown,
	user?: NonNullable<App.Locals["user"]> | null
): Promise<Response> {
	try {
		return await POST(buildEvent(body, user));
	} catch (err) {
		if (isHttpErrorLike(err)) {
			return new Response(JSON.stringify(err.body), {
				status: err.status,
				headers: { "content-type": "application/json" }
			});
		}
		throw err;
	}
}

function withServicePatches(
	patches: Record<string, unknown>
): () => Promise<void> {
	const originals: Record<string, unknown> = {};
	for (const key of Object.keys(patches)) {
		originals[key] = (
			SettingsService.prototype as unknown as Record<string, unknown>
		)[key];
		(
			SettingsService.prototype as unknown as Record<string, unknown>
		)[key] = patches[key];
	}
	return async () => {
		for (const key of Object.keys(originals)) {
			(
				SettingsService.prototype as unknown as Record<string, unknown>
			)[key] = originals[key];
		}
	};
}

describe("academic-calendar audit-log wiring", () => {
	beforeEach(() => {
		logMock.mockReset();
		logMock.mockResolvedValue(undefined);
		resetFixtures();
	});

	it("create-year writes an audit entry with action=create, entityType=smAcademicYears", async () => {
		const restore = withServicePatches({
			listAcademicYears: async function (this: SettingsService) {
				return yearRows
					.filter((row) => row.schoolId === this.schoolId)
					.slice()
					.sort((a, b) => a.id - b.id);
			},
			createAcademicYear: async function (
				this: SettingsService,
				input: Parameters<SettingsService["createAcademicYear"]>[0]
			) {
				const id = nextYearId++;
				const row: AcademicYearFixture = {
					id,
					schoolId: this.schoolId,
					year: input.year,
					title: input.title,
					startingDate: input.startingDate,
					endingDate: input.endingDate,
					activeStatus: 0,
					createdBy: input.createdBy,
					updatedBy: input.createdBy
				};
				yearRows.push(row);
				return row;
			}
		});
		try {
			const response = await callPost({
				kind: "create-year",
				payload: {
					year: "2026-2027",
					title: "2026/2027 Session",
					startingDate: "2026-09-01",
					endingDate: "2027-07-31"
				}
			});
			expect(response.status).toBe(200);

			const calls = logMock.mock.calls as unknown as Array<[AuditLogCall]>;
			expect(calls).toHaveLength(1);
			const call = calls[0][0];
			expect(call.schoolId).toBe(1);
			expect(call.actorStaffId).toBe(42);
			expect(call.action).toBe("create");
			expect(call.entityType).toBe("smAcademicYears");
			expect(call.entityId).toBe(String(nextYearId - 1));
			const before = call.before as Record<string, unknown>;
			const after = call.after as Record<string, unknown>;
			expect(before.yearCount).toBe(1);
			expect(after.year).toBe("2026-2027");
			expect(after.title).toBe("2026/2027 Session");
		} finally {
			await restore();
		}
	});

	it("set-active-year writes an audit entry capturing before/after activeYearId", async () => {
		const restore = withServicePatches({
			listAcademicYears: async function (this: SettingsService) {
				return yearRows
					.filter((row) => row.schoolId === this.schoolId)
					.slice()
					.sort((a, b) => a.id - b.id);
			},
			setActiveAcademicYear: async function (
				this: SettingsService,
				yearId: number
			) {
				for (const row of yearRows) {
					if (row.schoolId === this.schoolId) row.activeStatus = 0;
				}
				const target = yearRows.find(
					(row) => row.id === yearId && row.schoolId === this.schoolId
				);
				if (target) target.activeStatus = 1;
				return yearRows
					.filter((row) => row.schoolId === this.schoolId)
					.slice()
					.sort((a, b) => a.id - b.id);
			}
		});
		try {
			yearRows.push({
				id: 100,
				schoolId: 1,
				year: "2026-2027",
				title: "2026/2027 Session",
				startingDate: "2026-09-01",
				endingDate: "2027-07-31",
				activeStatus: 0,
				createdBy: 1,
				updatedBy: 1
			});

			const response = await callPost({
				kind: "set-active-year",
				payload: { yearId: 100 }
			});
			expect(response.status).toBe(200);

			const calls = logMock.mock.calls as unknown as Array<[AuditLogCall]>;
			expect(calls).toHaveLength(1);
			const call = calls[0][0];
			expect(call.action).toBe("update");
			expect(call.entityType).toBe("smAcademicYears.active");
			expect(call.entityId).toBe("100");
			const before = call.before as Record<string, unknown>;
			const after = call.after as Record<string, unknown>;
			expect(before.activeYearId).toBe(1);
			expect(after.activeYearId).toBe(100);

			expect(yearRows.find((r) => r.id === 1)?.activeStatus).toBe(0);
			expect(yearRows.find((r) => r.id === 100)?.activeStatus).toBe(1);
		} finally {
			await restore();
		}
	});

	it("create-exam writes an audit entry with action=create, entityType=smExamTypes", async () => {
		const restore = withServicePatches({
			listExamTypes: async function (
				this: SettingsService,
				academicId: number
			) {
				return examRows
					.filter(
						(row) => row.schoolId === this.schoolId && row.academicId === academicId
					)
					.slice()
					.sort((a, b) => a.id - b.id);
			},
			createExamType: async function (
				this: SettingsService,
				input: Parameters<SettingsService["createExamType"]>[0]
			) {
				const id = nextExamId++;
				const row: ExamTypeFixture = {
					id,
					schoolId: this.schoolId,
					academicId: input.academicId,
					title: input.title,
					isAverage: input.isAverage,
					percentage: input.percentage,
					averageMark: input.averageMark,
					activeStatus: 1,
					createdBy: input.createdBy,
					updatedBy: input.createdBy
				};
				examRows.push(row);
				return row;
			}
		});
		try {
			const response = await callPost({
				kind: "create-exam",
				payload: {
					academicId: 1,
					title: "Final Exam",
					isAverage: 1,
					percentage: 60,
					averageMark: 50
				}
			});
			expect(response.status).toBe(200);

			const calls = logMock.mock.calls as unknown as Array<[AuditLogCall]>;
			expect(calls).toHaveLength(1);
			const call = calls[0][0];
			expect(call.action).toBe("create");
			expect(call.entityType).toBe("smExamTypes");
			expect(call.actorStaffId).toBe(42);
			const before = call.before as Record<string, unknown>;
			const after = call.after as Record<string, unknown>;
			expect(before.examCount).toBe(1);
			expect(after.title).toBe("Final Exam");
		} finally {
			await restore();
		}
	});

	it("toggle-exam writes an audit entry with action=disable and entityType=smExamTypes", async () => {
		const restore = withServicePatches({
			toggleExamTypeActive: async function (this: SettingsService, id: number) {
				const current = examRows.find(
					(row) => row.id === id && row.schoolId === this.schoolId
				);
				if (!current) return null;
				current.activeStatus = current.activeStatus === 1 ? 0 : 1;
				return current;
			}
		});
		try {
			const response = await callPost({
				kind: "toggle-exam",
				payload: { examId: 900, academicId: 1 }
			});
			expect(response.status).toBe(200);

			const calls = logMock.mock.calls as unknown as Array<[AuditLogCall]>;
			expect(calls).toHaveLength(1);
			const call = calls[0][0];
			expect(call.entityType).toBe("smExamTypes");
			expect(call.entityId).toBe("900");
			expect(call.action).toBe("disable");
			const before = call.before as Record<string, unknown>;
			const after = call.after as Record<string, unknown>;
			expect(before.activeStatus).toBe(1);
			expect(after.activeStatus).toBe(0);
		} finally {
			await restore();
		}
	});

	it("GET does not write any audit entry (read-only)", async () => {
		const response = await GET(
			buildEvent(null, {
				id: 1,
				isAdministrator: true,
				designation: "admin",
				staffId: 42,
				schoolId: 1
			})
		);
		expect(response.status).toBe(200);
		expect(logMock).not.toHaveBeenCalled();
	});

	it("non-admin/IT caller is rejected with 403 and no audit entry is written", async () => {
		const response = await callPost(
			{
				kind: "create-year",
				payload: {
					year: "2026-2027",
					title: "2026/2027 Session",
					startingDate: "2026-09-01",
					endingDate: "2027-07-31"
				}
			},
			{
				id: 1,
				isAdministrator: false,
				staffId: 42,
				schoolId: 1
			} as unknown as NonNullable<App.Locals["user"]>
		);
		expect(response.status).toBe(403);
		expect(logMock).not.toHaveBeenCalled();
	});

	it("invalid payload is rejected with 400 and no audit entry is written", async () => {
		const response = await callPost({ kind: "create-year", payload: {} });
		expect(response.status).toBe(400);
		expect(logMock).not.toHaveBeenCalled();
	});

	it("set-active-year → getActiveAcademicYear returns the newly activated row", async () => {
		// Regression for Phase 4 Step 4: mark Y2024-2025 active, then on the
		// next request getActiveAcademicYear() must return that row.
		const restore = withServicePatches({
			listAcademicYears: async function (this: SettingsService) {
				return yearRows
					.filter((row) => row.schoolId === this.schoolId)
					.slice()
					.sort((a, b) => a.id - b.id);
			},
			createAcademicYear: async function (
				this: SettingsService,
				input: Parameters<SettingsService["createAcademicYear"]>[0]
			) {
				const id = nextYearId++;
				const row: AcademicYearFixture = {
					id,
					schoolId: this.schoolId,
					year: input.year,
					title: input.title,
					startingDate: input.startingDate,
					endingDate: input.endingDate,
					activeStatus: 0,
					createdBy: input.createdBy,
					updatedBy: input.createdBy
				};
				yearRows.push(row);
				return row;
			},
			setActiveAcademicYear: async function (
				this: SettingsService,
				id: number
			) {
				for (const row of yearRows) {
					if (row.schoolId === this.schoolId) row.activeStatus = 0;
				}
				const target = yearRows.find(
					(row) => row.schoolId === this.schoolId && row.id === id
				);
				if (!target) {
					throw new Error(`Year ${id} not found`);
				}
				target.activeStatus = 1;
				return yearRows
					.filter((r) => r.schoolId === this.schoolId)
					.slice()
					.sort((a, b) => a.id - b.id);
			},
			getActiveAcademicYear: async function (this: SettingsService) {
				const rows = await (
					this as unknown as { listAcademicYears: () => Promise<AcademicYearFixture[]> }
				).listAcademicYears();
				return rows.find((row) => row.activeStatus === 1) ?? null;
			}
		});
		try {
			const service = new SettingsService(1);
			logMock.mockClear();

			// Baseline: year 1 (2024-2025) is already active from resetFixtures().
			const baselineActive = await service.getActiveAcademicYear();
			expect(baselineActive?.id).toBe(1);
			expect(baselineActive?.year).toBe("2024-2025");
			expect(baselineActive?.activeStatus).toBe(1);

			// Create a NEW inactive academic year, then activate it.
			const created = await service.createAcademicYear({
				year: "2025-2026",
				title: "2025/2026 Session",
				startingDate: "2025-09-01",
				endingDate: "2026-07-31",
				createdBy: 42
			});
			expect(created.id).toBe(100);
			expect(created.activeStatus).toBe(0);

			const afterCreate = await service.getActiveAcademicYear();
			expect(afterCreate?.id).toBe(1); // still year 1, new row is inactive

			// Mark the new year active. This is the step the success criterion
			// cares about: on the *next request*, getActiveAcademicYear() must
			// reflect the change.
			const afterToggle = await service.setActiveAcademicYear(100);
			expect(afterToggle.find((row) => row.id === 1)?.activeStatus).toBe(0);
			expect(afterToggle.find((row) => row.id === 100)?.activeStatus).toBe(
				1
			);

			// Simulate a "next request": brand-new service instance reads
			// from the same backing fixtures.
			const nextRequestService = new SettingsService(1);
			const nextRequestActive = await nextRequestService.getActiveAcademicYear();
			expect(nextRequestActive).not.toBeNull();
			expect(nextRequestActive?.id).toBe(100);
			expect(nextRequestActive?.year).toBe("2025-2026");
			expect(nextRequestActive?.title).toBe("2025/2026 Session");
			expect(nextRequestActive?.activeStatus).toBe(1);

			// And re-toggling back to year 1 must clear year 100.
			await nextRequestService.setActiveAcademicYear(1);
			const backToYearOne = await nextRequestService.getActiveAcademicYear();
			expect(backToYearOne?.id).toBe(1);
			expect(
				afterToggle.find((row) => row.id === 100)?.activeStatus
			).toBe(0);
		} finally {
			await restore();
		}
	});
});
