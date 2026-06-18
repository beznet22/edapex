/**
 * Integration tests for `ResultsRepository`.
 *
 * Each test acquires a sandboxed transaction via `withTenantFixture`, exercises
 * a public method on `ResultsRepository` (resolved through the per-request
 * `ScopedRepositoryProvider`), then relies on the fixture's transactional
 * rollback to leave the dev database untouched.
 *
 * Where the repo's INSERT path requires an FK parent that the fixture does
 * not seed (`sm_subjects`, `sm_exams`), the test inserts those rows directly
 * via `fx.db` before exercising the repo method.
 *
 * Fact-checks for in-transaction state use `fx.db.select(...)`. The fixture's
 * open transaction is not visible to `fx.mysql` (separate process, default
 * REPEATABLE READ isolation), so `fx.mysql` is reserved for boundary checks
 * in a follow-up fixture (not nested, to avoid FK-lock contention with the
 * outer transaction).
 */
import { describe, it, expect } from "vitest";
import { canConnectDb } from "../mastra/integration-helpers/canConnectDb";
import { withTenantFixture, getTenantFixture } from "../mastra/integration-helpers/withTenantFixture";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import {
	classAttendances,
	smExams,
	smExamSetups,
	smStudents,
	smSubjects,
	smMarkStores,
	studentRatings,
	teacherRemarks,
} from "$lib/server/db/sms-schema";
import type {
	NewAttendance,
	NewExam,
	NewExamSetup,
	NewSmMarkStore,
	NewStudentRating,
	NewTeacherRemark,
} from "$lib/types/result-types";
import { eq } from "drizzle-orm";

const itIfDb = describe.skipIf(!(await canConnectDb()));

interface CountRow extends Record<string, string> {
	c: string;
}

describe("ResultsRepository — integration", () => {
	describe("batchUpsertMarkRecords", () => {
		it("persists rows for the fixture's student and accepts a second call without throwing", async () => {
			let capturedStudentId = 0;
			let capturedExamTypeId = 0;
			await withTenantFixture()(async (fx) => {
				capturedStudentId = fx.ids.studentId;
				capturedExamTypeId = fx.ids.examTypeId;

				const repo = fx.provider.getRepo(ResultsRepository);

				const initialMark: NewSmMarkStore = {
					studentId: fx.ids.studentId,
					studentRecordId: fx.ids.recordId,
					classId: fx.ids.classId,
					sectionId: fx.ids.sectionId,
					subjectId: null,
					examTermId: fx.ids.examTypeId,
					examSetupId: null,
					schoolId: fx.ids.schoolId,
					academicId: fx.ids.academicId,
					totalMarks: 80,
					isAbsent: 0,
					teacherRemarks: "first pass",
				};

				await repo.batchUpsertMarkRecords([initialMark]);

				const updatedMark: NewSmMarkStore = {
					...initialMark,
					totalMarks: 92,
					isAbsent: 0,
					teacherRemarks: "second pass",
				};

				await repo.batchUpsertMarkRecords([updatedMark]);

				const rows = await fx.db
					.select()
					.from(smMarkStores)
					.where(eq(smMarkStores.studentId, fx.ids.studentId));
				expect(rows.length).toBeGreaterThanOrEqual(1);
				const marks = rows.map((r) => Number(r.totalMarks));
				expect(marks).toContain(80);
				expect(marks).toContain(92);
			});

			const fxPost = await getTenantFixture();
			try {
				const pollution = await fxPost.mysql<CountRow>(
					"SELECT COUNT(*) AS c FROM sm_mark_stores WHERE student_id = ? AND exam_term_id = ?",
					[capturedStudentId, capturedExamTypeId],
				);
				expect(Number(pollution.rows[0]?.c ?? 0)).toBe(0);
			} finally {
				await fxPost.close();
			}
		});

		it("writes one row per student when given a batch", async () => {
			await withTenantFixture()(async (fx) => {
				const secondStudentId = fx.ids.studentId + 1;
				await fx.db.insert(smStudents).values({
					id: secondStudentId,
					admissionNo: secondStudentId,
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
				const repo = fx.provider.getRepo(ResultsRepository);

				const batch: NewSmMarkStore[] = [
					{
						studentId: fx.ids.studentId,
						studentRecordId: fx.ids.recordId,
						classId: fx.ids.classId,
						sectionId: fx.ids.sectionId,
						subjectId: null,
						examTermId: fx.ids.examTypeId,
						examSetupId: null,
						schoolId: fx.ids.schoolId,
						academicId: fx.ids.academicId,
						totalMarks: 75,
						isAbsent: 0,
					},
					{
						studentId: secondStudentId,
						studentRecordId: fx.ids.recordId,
						classId: fx.ids.classId,
						sectionId: fx.ids.sectionId,
						subjectId: null,
						examTermId: fx.ids.examTypeId,
						examSetupId: null,
						schoolId: fx.ids.schoolId,
						academicId: fx.ids.academicId,
						totalMarks: 88,
						isAbsent: 0,
					},
				];

				await repo.batchUpsertMarkRecords(batch);

				const rows = await fx.db
					.select()
					.from(smMarkStores)
					.where(eq(smMarkStores.examTermId, fx.ids.examTypeId));
				expect(rows.length).toBe(2);
				const byStudent = new Map(rows.map((r) => [r.studentId, Number(r.totalMarks)]));
				expect(byStudent.get(fx.ids.studentId)).toBe(75);
				expect(byStudent.get(secondStudentId)).toBe(88);
			});
		});
	});

	describe("upsertClassAttendance", () => {
		it("creates the attendance row keyed by (studentId, examTypeId) and is idempotent", async () => {
			await withTenantFixture()(async (fx) => {
				const repo = fx.provider.getRepo(ResultsRepository);

				const first: NewAttendance = {
					studentId: fx.ids.studentId,
					examTypeId: fx.ids.examTypeId,
					daysOpened: 30,
					daysPresent: 28,
					daysAbsent: 2,
					schoolId: fx.ids.schoolId,
					academicId: fx.ids.academicId,
				};

				const firstId = await repo.upsertClassAttendance(first);
				expect(typeof firstId).toBe("number");

				const second: NewAttendance = {
					...first,
					daysPresent: 27,
					daysAbsent: 3,
				};

				const secondId = await repo.upsertClassAttendance(second);
				expect(secondId).toBe(firstId);

				const rows = await fx.db
					.select()
					.from(classAttendances)
					.where(eq(classAttendances.studentId, fx.ids.studentId));
				expect(rows.length).toBe(1);
				expect(rows[0]?.id).toBe(firstId);
				expect(rows[0]?.daysPresent).toBe(27);
				expect(rows[0]?.daysAbsent).toBe(3);
			});
		});
	});

	describe("upsertTeacherRemark", () => {
		it("inserts a remark keyed by (studentId, examTypeId, academicId) and updates on conflict", async () => {
			await withTenantFixture()(async (fx) => {
				const repo = fx.provider.getRepo(ResultsRepository);

				const firstRemark: NewTeacherRemark = {
					studentId: fx.ids.studentId,
					examTypeId: fx.ids.examTypeId,
					academicId: fx.ids.academicId,
					teacherId: fx.ids.staffId,
					remark: "Good progress",
				};
				await repo.upsertTeacherRemark(firstRemark);

				const secondRemark: NewTeacherRemark = {
					...firstRemark,
					remark: "Excellent progress",
				};
				await repo.upsertTeacherRemark(secondRemark);

				const rows = await fx.db
					.select()
					.from(teacherRemarks)
					.where(eq(teacherRemarks.studentId, fx.ids.studentId));
				expect(rows.length).toBe(1);
				expect(rows[0]?.remark).toBe("Excellent progress");
				expect(rows[0]?.teacherId).toBe(fx.ids.staffId);
				expect(rows[0]?.examTypeId).toBe(fx.ids.examTypeId);
				expect(rows[0]?.academicId).toBe(fx.ids.academicId);
			});
		});
	});

	describe("upsertStudentRatings", () => {
		it("writes ratings keyed by (studentId, examTypeId, attribute)", async () => {
			await withTenantFixture()(async (fx) => {
				const repo = fx.provider.getRepo(ResultsRepository);

				const ratings: NewStudentRating[] = [
					{
						studentId: fx.ids.studentId,
						examTypeId: fx.ids.examTypeId,
						academicId: fx.ids.academicId,
						attribute: "Punctuality",
						rate: 4,
						color: "green",
						remark: "On time",
					},
					{
						studentId: fx.ids.studentId,
						examTypeId: fx.ids.examTypeId,
						academicId: fx.ids.academicId,
						attribute: "Homework",
						rate: 5,
						color: "blue",
						remark: "Consistent",
					},
				];

				await repo.upsertStudentRatings(ratings);

				const updated: NewStudentRating = {
					...ratings[0]!,
					rate: 5,
					color: "blue",
					remark: "Excellent punctuality",
				};
				await repo.upsertStudentRatings([updated]);

				const rows = await fx.db
					.select()
					.from(studentRatings)
					.where(eq(studentRatings.studentId, fx.ids.studentId));
				expect(rows.length).toBe(2);
				const punctuality = rows.find((r) => r.attribute === "Punctuality");
				expect(punctuality?.rate).toBe(5);
				expect(punctuality?.remark).toBe("Excellent punctuality");
				const homework = rows.find((r) => r.attribute === "Homework");
				expect(homework?.rate).toBe(5);
				expect(homework?.color).toBe("blue");
			});
		});
	});

	describe("getClassSectionById", () => {
		it("returns the row joined with class name + section name", async () => {
			await withTenantFixture()(async (fx) => {
				const repo = fx.provider.getRepo(ResultsRepository);

				const result = await repo.getClassSectionById(
					fx.ids.classId,
					fx.ids.sectionId,
				);

				expect(result).not.toBeNull();
				expect(result?.classId).toBe(fx.ids.classId);
				expect(result?.sectionId).toBe(fx.ids.sectionId);
				expect(result?.className).toContain(`Test Class ${fx.ids.classId}`);
				expect(result?.sectionName).toBe("A");
			});
		});

		it("returns null for a non-existent (classId, sectionId) pair", async () => {
			await withTenantFixture()(async (fx) => {
				const repo = fx.provider.getRepo(ResultsRepository);

				const result = await repo.getClassSectionById(
					fx.ids.classId + 99_999,
					fx.ids.sectionId + 99_999,
				);

				expect(result).toBeNull();
			});
		});
	});

	describe("createExamIfNotExist", () => {
		it("is idempotent: two calls produce one row, original values preserved on the second call", async () => {
			await withTenantFixture()(async (fx) => {
				const subjectId = fx.ids.staffId + 2_000;
				await fx.db.insert(smSubjects).values({
					id: subjectId,
					subjectName: "Science",
					subjectCode: "SCI",
					subjectType: "T",
					schoolId: fx.ids.schoolId,
					academicId: fx.ids.academicId,
					activeStatus: 1,
				});

				const repo = fx.provider.getRepo(ResultsRepository);

				const exam: NewExam = {
					classId: fx.ids.classId,
					sectionId: fx.ids.sectionId,
					subjectId,
					examTypeId: fx.ids.examTypeId,
					academicId: fx.ids.academicId,
					schoolId: fx.ids.schoolId,
					examMark: 100,
					passMark: 40,
					activeStatus: 1,
				};

				const firstId = await repo.createExamIfNotExist(exam);
				expect(typeof firstId).toBe("number");

				const secondId = await repo.createExamIfNotExist({
					...exam,
					examMark: 90,
				});
				expect(secondId).toBe(firstId);

				const rows = await fx.db
					.select()
					.from(smExams)
					.where(eq(smExams.subjectId, subjectId));
				expect(rows.length).toBe(1);
				expect(rows[0]?.id).toBe(firstId);
				expect(Number(rows[0]?.examMark)).toBe(100);
			});
		});
	});

	describe("upsertExamSetup", () => {
		it("creates an exam_setup row when none exists, updates on second call", async () => {
			await withTenantFixture()(async (fx) => {
				const subjectId = fx.ids.staffId + 3_000;
				await fx.db.insert(smSubjects).values({
					id: subjectId,
					subjectName: "English",
					subjectCode: "ENG",
					subjectType: "T",
					schoolId: fx.ids.schoolId,
					academicId: fx.ids.academicId,
					activeStatus: 1,
				});

				const examId = fx.ids.staffId + 3_100;
				await fx.db.insert(smExams).values({
					id: examId,
					classId: fx.ids.classId,
					sectionId: fx.ids.sectionId,
					subjectId,
					examTypeId: fx.ids.examTypeId,
					academicId: fx.ids.academicId,
					schoolId: fx.ids.schoolId,
					examMark: 100,
					passMark: 40,
					activeStatus: 1,
				});

				const repo = fx.provider.getRepo(ResultsRepository);

				const firstSetup: NewExamSetup = {
					examTitle: `Midterm Paper ${fx.ids.staffId}`,
					examMark: 50,
					examId,
					classId: fx.ids.classId,
					sectionId: fx.ids.sectionId,
					subjectId,
					examTermId: fx.ids.examTypeId,
					schoolId: fx.ids.schoolId,
					academicId: fx.ids.academicId,
					activeStatus: 1,
				};

				const firstId = await repo.upsertExamSetup(firstSetup);
				expect(typeof firstId).toBe("number");

				const secondId = await repo.upsertExamSetup({
					...firstSetup,
					examMark: 75,
				});
				expect(secondId).toBe(firstId);

				const allSetups = await fx.db.select().from(smExamSetups);
				const created = allSetups.find(
					(s) =>
						s.examTitle === firstSetup.examTitle &&
						s.examId === examId &&
						s.subjectId === subjectId,
				);
				expect(created).toBeDefined();
				expect(Number(created?.examMark)).toBe(75);
			});
		});
	});

	describe("cross-tenant isolation", () => {
		it("results for tenant-A's schoolId are NOT visible to tenant-B's provider queries", async () => {
			let tenantAExamSetupId = 0;
			let tenantAMarkStudentId = 0;
			await withTenantFixture()(async (fx) => {
				const subjectId = fx.ids.staffId + 4_000;
				await fx.db.insert(smSubjects).values({
					id: subjectId,
					subjectName: "Geography",
					subjectCode: "GEO",
					subjectType: "T",
					schoolId: fx.ids.schoolId,
					academicId: fx.ids.academicId,
					activeStatus: 1,
				});

				const mark: NewSmMarkStore = {
					studentId: fx.ids.studentId,
					studentRecordId: fx.ids.recordId,
					classId: fx.ids.classId,
					sectionId: fx.ids.sectionId,
					subjectId,
					examTermId: fx.ids.examTypeId,
					examSetupId: null,
					schoolId: fx.ids.schoolId,
					academicId: fx.ids.academicId,
					totalMarks: 70,
					isAbsent: 0,
				};

				const repo = fx.provider.getRepo(ResultsRepository);
				await repo.batchUpsertMarkRecords([mark]);

				const remark: NewTeacherRemark = {
					studentId: fx.ids.studentId,
					examTypeId: fx.ids.examTypeId,
					academicId: fx.ids.academicId,
					teacherId: fx.ids.staffId,
					remark: "Tenant A mark",
				};
				await repo.upsertTeacherRemark(remark);

				tenantAExamSetupId = fx.ids.examTypeId;
				tenantAMarkStudentId = fx.ids.studentId;

				const examRows = await fx.db
					.select()
					.from(smExams)
					.where(eq(smExams.schoolId, fx.ids.schoolId));
				expect(examRows.length).toBe(0);

				const markRows = await fx.db
					.select()
					.from(smMarkStores)
					.where(eq(smMarkStores.schoolId, fx.ids.schoolId));
				expect(markRows.length).toBe(1);
			});

			const fxPost = await getTenantFixture();
			try {
				const pollution = await fxPost.mysql<CountRow>(
					"SELECT COUNT(*) AS c FROM sm_mark_stores WHERE student_id = ? AND exam_term_id = ?",
					[tenantAMarkStudentId, tenantAExamSetupId],
				);
				expect(Number(pollution.rows[0]?.c ?? 0)).toBe(0);
			} finally {
				await fxPost.close();
			}
		});
	});
});