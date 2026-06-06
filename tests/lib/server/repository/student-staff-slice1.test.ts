import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({
	env: { DATABASE_URL: "mysql://test@localhost:3306/test" },
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

vi.mock("$lib/components/template/style.css?inline", () => ({
	default: "",
}));

const { mockDb } = vi.hoisted(() => {
	const mockDb: any = { select: vi.fn() };
	return { mockDb };
});

vi.mock("$lib/server/db", () => ({
	getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

import { StudentRepository } from "$lib/server/repository/student.repo";
import { StaffRepository } from "$lib/server/repository/staff.repo";
import { BaseRepository } from "$lib/server/repository/base.repo";

class TestStudentRepo extends StudentRepository {
	constructor() {
		super({} as any, {} as any, {} as any);
	}
	getDbForTest() {
		return this.db;
	}
}

function makeStudentRepo() {
	return new TestStudentRepo();
}

class TestStaffRepo extends StaffRepository {
	constructor() {
		super({} as any, {} as any, {} as any);
	}
}

function makeStaffRepo() {
	return new TestStaffRepo();
}

describe("Slice 1 — new StudentRepository methods (B4)", () => {
	describe("resolveGenderId", () => {
		it("returns null immediately for empty string (no DB hit)", async () => {
			const repo = makeStudentRepo();
			const result = await repo.resolveGenderId("");
			expect(result).toBeNull();
		});

		it("returns null for null (no DB hit)", async () => {
			const repo = makeStudentRepo();
			const result = await repo.resolveGenderId(null as any);
			expect(result).toBeNull();
		});

		it("returns null for undefined (no DB hit)", async () => {
			const repo = makeStudentRepo();
			const result = await repo.resolveGenderId(undefined as any);
			expect(result).toBeNull();
		});
	});

	describe("resolveStudentCategoryId", () => {
		it("returns null immediately for empty string (no DB hit)", async () => {
			const repo = makeStudentRepo();
			const result = await repo.resolveStudentCategoryId("");
			expect(result).toBeNull();
		});

		it("returns null for null (no DB hit)", async () => {
			const repo = makeStudentRepo();
			const result = await repo.resolveStudentCategoryId(null as any);
			expect(result).toBeNull();
		});

		it("returns null for undefined (no DB hit)", async () => {
			const repo = makeStudentRepo();
			const result = await repo.resolveStudentCategoryId(undefined as any);
			expect(result).toBeNull();
		});
	});

	describe("getRollNoAndAdmissionNo", () => {
		it("returns null/null immediately for zero studentId (no DB hit)", async () => {
			const repo = makeStudentRepo();
			const result = await repo.getRollNoAndAdmissionNo(0);
			expect(result).toEqual({ rollNo: null, admissionNo: null });
		});
	});
});

describe("Slice 1 — new StaffRepository method (B10)", () => {
	describe("getById", () => {
		it("returns null immediately for zero teacherId (no DB hit)", async () => {
			const repo = makeStaffRepo();
			const result = await repo.getById(0);
			expect(result).toBeNull();
		});
	});
});
