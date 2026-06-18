/**
 * Integration tests for `StudentRepository`.
 *
 * Each test acquires a sandboxed transaction via `withTenantFixture`, exercises
 * a public method on `StudentRepository` (resolved through the per-request
 * `ScopedRepositoryProvider`), then relies on the fixture's transactional
 * rollback to leave the dev database untouched.
 *
 * The fixture's `student_records` row is seeded without `is_default = 1`, so
 * tests that exercise the student-record LEFT JOIN (getById, searchStudent,
 * getStudentsByClassSection) flip that flag inside the transaction before
 * calling the repository method.
 *
 * Fact-checks for in-transaction state use `fx.db.select(...)`. The fixture's
 * open transaction is not visible to `fx.mysql` (separate process, default
 * REPEATABLE READ isolation), so `fx.mysql` is reserved for boundary checks
 * that don't need to see in-flight rows — e.g. confirming dev-DB pre-existing
 * counts are unchanged. Nesting `withTenantFixture()` inside an already-open
 * fixture creates a second transaction whose FK checks deadlock against the
 * outer transaction's locked parent rows, so pollution checks are issued
 * after the outer fixture closes (in a separate top-level `it` step).
 */
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { canConnectDb } from "../mastra/integration-helpers/canConnectDb";
import { withTenantFixture, getTenantFixture } from "../mastra/integration-helpers/withTenantFixture";
import { StudentRepository } from "$lib/server/repository/student.repo";
import {
	smBaseSetups,
	smClasses,
	smSections,
	smStudentCategories,
	smStudents,
	studentRecords,
} from "$lib/server/db/sms-schema";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";

const itIfDb = describe.skipIf(!(await canConnectDb()));

async function markFixtureRecordDefault(fx: {
	db: import("../mastra/integration-helpers/withTenantFixture").FixtureDb;
	ids: { studentId: number; academicId: number };
}): Promise<void> {
	await fx.db
		.update(studentRecords)
		.set({ isDefault: 1, activeStatus: 1 })
		.where(
			and(
				eq(studentRecords.studentId, fx.ids.studentId),
				eq(studentRecords.academicId, fx.ids.academicId),
			),
		);
}

itIfDb("StudentRepository — integration", () => {
	it("getById returns the student joined with their student_records row", async () => {
		let capturedStudentId = 0;
		await withTenantFixture()(async (fx) => {
			await markFixtureRecordDefault(fx);
			capturedStudentId = fx.ids.studentId;

			const repo = fx.provider.getRepo(StudentRepository);
			const result = await repo.getById(fx.ids.studentId);

			expect(result).not.toBeNull();
			expect(result?.studentId).toBe(fx.ids.studentId);
			expect(result?.fullName).toBe("Test Student");
			expect(result?.studentRecordId).not.toBeNull();
			expect(result?.studentRecordId).toBe(fx.ids.recordId);
			expect(result?.classId).toBe(fx.ids.classId);
			expect(result?.sectionId).toBe(fx.ids.sectionId);
			expect(result?.className).toContain(`Test Class ${fx.ids.classId}`);
			expect(result?.sectionName).toBe("A");

			const fact = await fx.db
				.select()
				.from(smStudents)
				.where(eq(smStudents.id, fx.ids.studentId));
			expect(fact.length).toBe(1);
			expect(fact[0]?.id).toBe(fx.ids.studentId);
		});

		const fxPost = await getTenantFixture();
		try {
			const pollution = await fxPost.mysql<{ c: string }>(
				"SELECT COUNT(*) AS c FROM sm_students WHERE id = ?",
				[capturedStudentId],
			);
			expect(Number(pollution.rows[0]?.c ?? 0)).toBe(0);
		} finally {
			await fxPost.close();
		}
	});

	it("getById returns null for a non-existent id (does not throw)", async () => {
		await withTenantFixture()(async (fx) => {
			const repo = fx.provider.getRepo(StudentRepository);
			const result = await repo.getById(98_765_401);
			expect(result).toBeNull();
		});
	});

	it("searchStudent LIKE-matches against fullName and returns results scoped to class+section", async () => {
		await withTenantFixture()(async (fx) => {
			await markFixtureRecordDefault(fx);

			const repo = fx.provider.getRepo(StudentRepository);

			const matched = await repo.searchStudent("Test", {
				classId: fx.ids.classId,
				sectionId: fx.ids.sectionId,
			});
			expect(matched.length).toBeGreaterThanOrEqual(1);
			expect(matched[0]?.fullName).toBe("Test Student");
			expect(matched[0]?.className).toContain(`Test Class ${fx.ids.classId}`);

			const outOfScope = await repo.searchStudent("Test", {
				classId: 98_765_411,
				sectionId: 98_765_412,
			});
			expect(outOfScope.length).toBe(0);

			const fact = await fx.db
				.select()
				.from(smStudents)
				.where(
					and(
						eq(smStudents.schoolId, fx.ids.schoolId),
						eq(smStudents.activeStatus, 1),
					),
				);
			const testMatches = fact.filter((s) => s.fullName?.includes("Test"));
			expect(testMatches.length).toBe(1);
		});
	});

	it("getStudentsByClassSection returns every student enrolled in the given class+section", async () => {
		await withTenantFixture()(async (fx) => {
			await markFixtureRecordDefault(fx);

			const otherStudentId = fx.ids.studentId + 1;
			const otherClassId = fx.ids.classId + 1;
			const otherSectionId = fx.ids.sectionId + 1;
			await fx.db.insert(smClasses).values({
				id: otherClassId,
				className: "Companion Class",
				schoolId: fx.ids.schoolId,
				academicId: fx.ids.academicId,
				activeStatus: 1,
			});
			await fx.db.insert(smSections).values({
				id: otherSectionId,
				sectionName: "B",
				schoolId: fx.ids.schoolId,
				academicId: fx.ids.academicId,
				activeStatus: 1,
			});
			await fx.db.insert(smStudents).values({
				id: otherStudentId,
				admissionNo: otherStudentId,
				firstName: "Companion",
				lastName: "Student",
				fullName: "Companion Student",
				schoolId: fx.ids.schoolId,
				academicId: fx.ids.academicId,
				classId: fx.ids.classId,
				sectionId: fx.ids.sectionId,
				parentId: fx.ids.parentId,
				userId: fx.ids.userId,
				activeStatus: 1,
			});
			await fx.db.insert(studentRecords).values({
				classId: fx.ids.classId,
				sectionId: fx.ids.sectionId,
				schoolId: fx.ids.schoolId,
				academicId: fx.ids.academicId,
				studentId: otherStudentId,
				sessionId: fx.ids.academicId,
				isDefault: 1,
				activeStatus: 1,
			});

			const repo = fx.provider.getRepo(StudentRepository);
			const inSection = await repo.getStudentsByClassSection({
				classId: fx.ids.classId,
				sectionId: fx.ids.sectionId,
			});
			expect(inSection).not.toBeNull();
			expect(inSection?.length).toBe(2);
			const ids = inSection?.map((s) => s.id).sort((a, b) => a - b);
			expect(ids).toEqual([fx.ids.studentId, otherStudentId].sort((a, b) => a - b));

			const empty = await repo.getStudentsByClassSection({
				classId: otherClassId,
				sectionId: otherSectionId,
			});
			expect(empty).not.toBeNull();
			expect(empty?.length).toBe(0);

			const fact = await fx.db
				.select()
				.from(studentRecords)
				.where(
					and(
						eq(studentRecords.classId, fx.ids.classId),
						eq(studentRecords.sectionId, fx.ids.sectionId),
						eq(studentRecords.schoolId, fx.ids.schoolId),
						eq(studentRecords.isDefault, 1),
						eq(studentRecords.activeStatus, 1),
					),
				);
			expect(fact.length).toBe(2);
		});
	});

	it("assignClassSection updates the student's record and is idempotent on a second call (one row)", async () => {
		let capturedStudentId = 0;
		let capturedSchoolId = 0;
		await withTenantFixture()(async (fx) => {
			capturedStudentId = fx.ids.studentId;
			capturedSchoolId = fx.ids.schoolId;

			const newClassId = fx.ids.classId + 1;
			const newSectionId = fx.ids.sectionId + 1;
			await fx.db.insert(smClasses).values({
				id: newClassId,
				className: "Target Class",
				schoolId: fx.ids.schoolId,
				academicId: fx.ids.academicId,
				activeStatus: 1,
			});
			await fx.db.insert(smSections).values({
				id: newSectionId,
				sectionName: "B",
				schoolId: fx.ids.schoolId,
				academicId: fx.ids.academicId,
				activeStatus: 1,
			});

			const repo = fx.provider.getRepo(StudentRepository);

			const first = await repo.assignClassSection({
				studentId: fx.ids.studentId,
				classId: newClassId,
				sectionId: newSectionId,
			});
			expect(first).toBe(true);

			const second = await repo.assignClassSection({
				studentId: fx.ids.studentId,
				classId: newClassId,
				sectionId: newSectionId,
			});
			expect(second).toBe(true);

			const records = await fx.db
				.select()
				.from(studentRecords)
				.where(
					and(
						eq(studentRecords.studentId, fx.ids.studentId),
						eq(studentRecords.schoolId, fx.ids.schoolId),
					),
				);
			expect(records.length).toBe(1);
			expect(records[0]?.id).toBe(fx.ids.recordId);
			expect(records[0]?.classId).toBe(newClassId);
			expect(records[0]?.sectionId).toBe(newSectionId);
			expect(records[0]?.isDefault).toBe(1);
			expect(records[0]?.activeStatus).toBe(1);
		});

		const fxPost = await getTenantFixture();
		try {
			const pollution = await fxPost.mysql<{ c: string }>(
				"SELECT COUNT(*) AS c FROM student_records WHERE student_id = ? AND school_id = ?",
				[capturedStudentId, capturedSchoolId],
			);
			expect(Number(pollution.rows[0]?.c ?? 0)).toBe(0);
		} finally {
			await fxPost.close();
		}
	});

	it("resolveGenderId returns the sm_base_setups id for a known gender (lookup)", async () => {
		await withTenantFixture()(async (fx) => {
			const genderGroupId = 1;
			const baseSetupId = fx.ids.studentId + 101;
			const setupName = `FemaleTest${fx.ids.studentId}`;
			await fx.db.insert(smBaseSetups).values({
				id: baseSetupId,
				baseSetupName: setupName,
				baseGroupId: genderGroupId,
				schoolId: fx.ids.schoolId,
				activeStatus: 1,
			});

			const setups = await fx.db
				.select()
				.from(smBaseSetups)
				.where(eq(smBaseSetups.schoolId, fx.ids.schoolId));
			expect(setups.length).toBe(1);
			expect(setups[0]?.id).toBe(baseSetupId);
			expect(setups[0]?.baseSetupName).toBe(setupName);
			expect(setups[0]?.baseGroupId).toBe(genderGroupId);

			const repo = fx.provider.getRepo(StudentRepository);
			const found = await repo.resolveGenderId(setupName);
			expect(found).toBe(baseSetupId);

			const missing = await repo.resolveGenderId("Alien");
			expect(missing).toBeNull();

			const empty = await repo.resolveGenderId("");
			expect(empty).toBeNull();
		});
	});

	it("resolveStudentCategoryId returns the sm_student_categories id for a known name (lookup)", async () => {
		await withTenantFixture()(async (fx) => {
			const categoryId = fx.ids.studentId + 200;
			const uniqueName = `Gen${fx.ids.studentId}`;
			await fx.db.insert(smStudentCategories).values({
				id: categoryId,
				categoryName: uniqueName,
				schoolId: fx.ids.schoolId,
				academicId: fx.ids.academicId,
			});

			const repo = fx.provider.getRepo(StudentRepository);
			const found = await repo.resolveStudentCategoryId(uniqueName);
			expect(found).toBe(categoryId);

			const missing = await repo.resolveStudentCategoryId("Mythical");
			expect(missing).toBeNull();

			const cats = await fx.db
				.select()
				.from(smStudentCategories)
				.where(eq(smStudentCategories.schoolId, fx.ids.schoolId));
			expect(cats.length).toBe(1);
		});
	});

	it("cross-tenant isolation: getById in tenant-B cannot see a student committed by tenant-A", async () => {
		const fxA = await getTenantFixture();
		try {
			await markFixtureRecordDefault(fxA);

			const repoA = fxA.provider.getRepo(StudentRepository);
			const seenByA = await repoA.getById(fxA.ids.studentId);
			expect(seenByA).not.toBeNull();
			expect(seenByA?.studentId).toBe(fxA.ids.studentId);
		} finally {
			await fxA.close();
		}

		const fxB = await getTenantFixture();
		try {
			expect(fxB.ids.schoolId).not.toBe(fxA.ids.schoolId);

			const tenantB = createTenantContext({
				schoolId: fxB.ids.schoolId,
				classId: fxB.tenant.classId,
				sectionId: fxB.tenant.sectionId,
				examId: fxB.tenant.examId,
				examTypeId: fxB.tenant.examTypeId,
				academicId: fxB.tenant.academicId,
				studentId: fxB.tenant.studentId,
				userId: fxB.tenant.userId,
				staffId: fxB.tenant.staffId,
				roleId: fxB.tenant.roleId,
				designationId: fxB.tenant.designationId,
			});
			const providerB = new ScopedRepositoryProvider(
				fxB.db as unknown as ConstructorParameters<typeof ScopedRepositoryProvider>[0],
				tenantB,
			);
			const repoB = providerB.getRepo(StudentRepository);

			const seenByB = await repoB.getById(fxA.ids.studentId);
			expect(seenByB).toBeNull();

			const visible = await fxB.db
				.select()
				.from(smStudents)
				.where(eq(smStudents.id, fxA.ids.studentId));
			expect(visible.length).toBe(0);

			const pollution = await fxB.mysql<{ c: string }>(
				"SELECT COUNT(*) AS c FROM sm_students WHERE id = ?",
				[fxA.ids.studentId],
			);
			expect(Number(pollution.rows[0]?.c ?? 0)).toBe(0);
		} finally {
			await fxB.close();
		}
	});
});