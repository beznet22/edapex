/**
 * Integration tests for `AssessmentService.upsertMarksheet`.
 *
 * Exercises the production code path (assessment.service.ts:538) against the
 * live MySQL DB. Each test acquires a sandboxed transaction via
 * `withTenantFixture`, runs the method, and verifies both in-transaction
 * state (via the fixture's connection-bound Drizzle) and committed state
 * (via the raw `mysql` shell, which sees only committed rows).
 *
 * Per-test seeding (inside the fixture's transaction):
 *   1. Mark the fixture's `student_records` row as `is_default = 1` so the
 *      `StudentRepository.getStudentById` LEFT JOIN resolves to a non-null
 *      `studentRecordId` (which `upsertMarksheet` requires).
 *   2. Insert one `sm_student_categories` row and set the student's
 *      `studentCategoryId` so the pre-flight linkage check passes.
 *   3. Insert one `sm_subjects` row and a matching `sm_assign_subjects` row
 *      so `doProcessMarks` can resolve the subject (FK on `sm_exams`).
 *
 * Known interaction note: `upsertMarksheet` opens its own Drizzle
 * transaction (`result().db.transaction(...)`) for its commit / rollback
 * semantics. MySQL's `START TRANSACTION` statement implicitly commits any
 * currently-open transaction, so the fixture's wrapping `beginTransaction`
 * commits when Drizzle fires its own `BEGIN`. The fixture's `close()`
 * rollback therefore becomes a no-op for the affected rows.
 *
 * To keep the dev DB clean, each test issues an explicit `DELETE` cleanup
 * via the raw mysql2 pool (`getPool()`) after the assertions complete. The
 * DELETE only targets rows belonging to the fixture's sandboxed `schoolId`,
 * which sits in the [9_999_001, 9_999_999] range and never collides with
 * production data.
 *
 * Test files are skipped entirely when `canConnectDb()` returns false.
 */
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { canConnectDb } from "../mastra/integration-helpers/canConnectDb";
import { withTenantFixture } from "../mastra/integration-helpers/withTenantFixture";
import { AssessmentService } from "$lib/server/service/assessment.service";
import { getPool } from "$lib/server/db";
import {
	smAssignSubjects,
	smMarkStores,
	smResultStores,
	smStudentCategories,
	smStudentTimelines,
	smStudents,
	smSubjects,
	studentRecords,
} from "$lib/server/db/sms-schema";
import type { Marksheet } from "$lib/schema/marksheet";
import { runMysql } from "../mastra/integration-helpers/mysqlFactCheck";

const itIfDb = describe.skipIf(!(await canConnectDb()));

interface CountRow extends Record<string, string> {
	c: string;
}

interface FixtureSeedIds {
	readonly schoolId: number;
	readonly classId: number;
	readonly sectionId: number;
	readonly academicId: number;
	readonly staffId: number;
	readonly userId: number;
	readonly parentId: number;
	readonly studentId: number;
	readonly recordId: number;
	readonly examTypeId: number;
	readonly studentCategoryId: number;
	readonly subjectId: number;
}

type FixtureDb = import("../mastra/integration-helpers/withTenantFixture").FixtureDb;

async function markFixtureRecordDefault(fx: {
	db: FixtureDb;
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

async function seedPrerequisites(
	fx: { db: FixtureDb; ids: FixtureSeedIds },
): Promise<void> {
	await markFixtureRecordDefault(fx);

	await fx.db.insert(smStudentCategories).values({
		id: fx.ids.studentCategoryId,
		categoryName: "MIDDLEBASIC",
		schoolId: fx.ids.schoolId,
		academicId: fx.ids.academicId,
	});
	await fx.db
		.update(smStudents)
		.set({ studentCategoryId: fx.ids.studentCategoryId })
		.where(eq(smStudents.id, fx.ids.studentId));

	await fx.db.insert(smSubjects).values({
		id: fx.ids.subjectId,
		subjectName: "Mathematics",
		subjectCode: "MATH",
		subjectType: "T",
		schoolId: fx.ids.schoolId,
		academicId: fx.ids.academicId,
		activeStatus: 1,
	});

	await fx.db.insert(smAssignSubjects).values({
		classId: fx.ids.classId,
		sectionId: fx.ids.sectionId,
		subjectId: fx.ids.subjectId,
		teacherId: fx.ids.staffId,
		academicId: fx.ids.academicId,
		schoolId: fx.ids.schoolId,
		activeStatus: 1,
	});
}

function buildMarksheet(
	ids: FixtureSeedIds,
	overrides?: {
		readonly studentId?: number;
		readonly examTypeId?: number;
		readonly omitExamType?: boolean;
		readonly subjectId?: number;
		readonly marks?: readonly number[];
	},
): Marksheet {
	const studentId = overrides?.studentId ?? ids.studentId;
	const examTypeId = overrides?.examTypeId ?? ids.examTypeId;
	const subjectId = overrides?.subjectId ?? ids.subjectId;
	const marks = overrides?.marks ?? [25, 8, 9, 45];

	return {
		school: {
			id: ids.schoolId,
			name: `Test School ${ids.schoolId}`,
			email: `school-${ids.schoolId}@example.test`,
			phone: "+10000000000",
			city: "Test City",
			state: "Test State",
			title: "Test School",
			vacation_date: "2099-12-31",
		},
		student: {
			id: studentId,
			examId: examTypeId,
			fullName: "Test Student",
			gender: "Female",
			parentEmail: "parent@example.test",
			parentName: "Test Guardian",
			term: "Term 1",
			title: "TERM",
			category: "MIDDLEBASIC",
			className: `Test Class ${ids.classId}`,
			sectionName: "A",
			adminNo: ids.studentId,
			sessionYear: "2099-[Test Year]",
			daysOpened: 60,
			daysAbsent: 2,
			daysPresent: 58,
			token: "test-token",
		},
		subjects: [
			{
				subjectId,
				subjectCode: "MATH",
				teacherId: ids.staffId,
			},
		],
		records: [
			{
				studentId,
				resultId: 0,
				subjectId,
				subject: "Mathematics",
				subjectCode: "MATH",
				objectives: null,
				titleIds: [],
				titles: ["MTA", "CA", "REPORT", "EXAM"],
				markIds: [],
				marks: [...marks],
				fullMarks: [30, 10, 10, 50],
				totalScore: marks.reduce((sum, m) => sum + m, 0),
				grade: "B",
				color: "bg-blue-200",
				category: "MIDDLEBASIC",
				learningOutcome: null,
			},
		],
		score: {
			total: marks.reduce((sum, m) => sum + m, 0),
			average: marks.reduce((sum, m) => sum + m, 0),
			classAverage: {
				min: { value: "60" },
				max: { value: "95" },
			},
			maxScores: 400,
		},
		ratings: [
			{
				attribute: "Punctuality",
				rate: 4,
				remark: "Always on time",
				color: "green",
			},
		],
		remark: { remark: "Good progress this term" },
		...(overrides?.omitExamType
			? {}
			: {
					examType: {
						id: examTypeId,
						activeStatus: 1,
						title: "Test Term",
						isAverage: 0,
						percentage: null,
						averageMark: 0,
					},
				}),
		recordId: null,
	};
}

/**
 * Best-effort cleanup of every sandboxed row touched by a fixture, issued
 * via the raw pool so it sees the rows that MySQL implicitly committed when
 * Drizzle fired its own BEGIN. Idempotent — safe to call even when nothing
 * leaked.
 */
async function cleanupSandbox(ids: FixtureSeedIds): Promise<void> {
	const pool = getPool();
	await pool.query(
		`DELETE FROM sm_mark_stores WHERE school_id = ?`,
		[ids.schoolId],
	);
	await pool.query(
		`DELETE FROM sm_result_stores WHERE school_id = ?`,
		[ids.schoolId],
	);
	await pool.query(
		`DELETE FROM teacher_remarks WHERE student_id = ?`,
		[ids.studentId],
	);
	await pool.query(
		`DELETE FROM student_ratings WHERE student_id = ?`,
		[ids.studentId],
	);
	await pool.query(
		`DELETE FROM class_attendances WHERE school_id = ?`,
		[ids.schoolId],
	);
	await pool.query(
		`DELETE FROM sm_student_timelines WHERE school_id = ?`,
		[ids.schoolId],
	);
	await pool.query(
		`DELETE FROM sm_exam_setups WHERE school_id = ?`,
		[ids.schoolId],
	);
	await pool.query(`DELETE FROM sm_exams WHERE school_id = ?`, [ids.schoolId]);
	await pool.query(
		`DELETE FROM sm_assign_subjects WHERE school_id = ?`,
		[ids.schoolId],
	);
	await pool.query(`DELETE FROM sm_subjects WHERE id = ?`, [ids.subjectId]);
	await pool.query(
		`DELETE FROM sm_student_categories WHERE id = ?`,
		[ids.studentCategoryId],
	);
	await pool.query(
		`DELETE FROM student_records WHERE id = ?`,
		[ids.recordId],
	);
	await pool.query(`DELETE FROM sm_students WHERE id = ?`, [ids.studentId]);
	await pool.query(`DELETE FROM sm_staffs WHERE id = ?`, [ids.staffId]);
	await pool.query(`DELETE FROM sm_parents WHERE id = ?`, [ids.parentId]);
	await pool.query(`DELETE FROM users WHERE id = ?`, [ids.userId]);
	await pool.query(
		`DELETE FROM sm_class_sections WHERE school_id = ?`,
		[ids.schoolId],
	);
	await pool.query(`DELETE FROM sm_classes WHERE id = ?`, [ids.classId]);
	await pool.query(`DELETE FROM sm_sections WHERE id = ?`, [ids.sectionId]);
	await pool.query(`DELETE FROM sm_exam_types WHERE id = ?`, [ids.examTypeId]);
	await pool.query(
		`DELETE FROM sm_academic_years WHERE id = ?`,
		[ids.academicId],
	);
	await pool.query(`DELETE FROM sm_schools WHERE id = ?`, [ids.schoolId]);
}

const seedIdsFor = (
	fx: {
		ids: {
			studentId: number;
			schoolId: number;
			classId: number;
			sectionId: number;
			academicId: number;
			staffId: number;
			recordId: number;
			examTypeId: number;
			userId: number;
			parentId: number;
		};
	},
): FixtureSeedIds => ({
	schoolId: fx.ids.schoolId,
	classId: fx.ids.classId,
	sectionId: fx.ids.sectionId,
	academicId: fx.ids.academicId,
	staffId: fx.ids.staffId,
	userId: fx.ids.userId,
	parentId: fx.ids.parentId,
	studentId: fx.ids.studentId,
	recordId: fx.ids.recordId,
	examTypeId: fx.ids.examTypeId,
	studentCategoryId: fx.ids.studentId + 1_000_000,
	subjectId: fx.ids.staffId + 5_000,
});

itIfDb("AssessmentService.upsertMarksheet — integration", () => {
	it("happy path: persists marks, ratings, remark, attendance, and timeline; returns Marksheet with recordId populated", async () => {
		let seedIds: FixtureSeedIds | null = null;
		try {
			await withTenantFixture()(async (fx) => {
				seedIds = seedIdsFor(fx);
				await seedPrerequisites({ db: fx.db, ids: seedIds });

				const svc = new AssessmentService(fx.provider);
				const marksheet = buildMarksheet(seedIds);

				const response = await svc.upsertMarksheet(
					marksheet,
					seedIds.staffId,
				);

				expect(response).toBe(marksheet);
				expect(response.recordId).toBe(seedIds.recordId);
				expect(typeof response.recordId).toBe("number");

				const markRows = await fx.db
					.select()
					.from(smMarkStores)
					.where(eq(smMarkStores.studentId, seedIds.studentId));
				expect(markRows.length).toBe(4);
				const totals = markRows.map((m) => Number(m.totalMarks)).sort((a, b) => a - b);
				expect(totals).toEqual([8, 9, 25, 45]);

				const resultRows = await fx.db
					.select()
					.from(smResultStores)
					.where(eq(smResultStores.studentId, seedIds.studentId));
				expect(resultRows.length).toBe(1);
				expect(Number(resultRows[0]?.totalMarks)).toBe(87);
				expect(resultRows[0]?.examTypeId).toBe(seedIds.examTypeId);

				const timelineRows = await fx.db
					.select()
					.from(smStudentTimelines)
					.where(
						and(
							eq(smStudentTimelines.staffStudentId, seedIds.studentId),
							eq(smStudentTimelines.type, `exam-${seedIds.examTypeId}`),
						),
					);
				expect(timelineRows.length).toBe(1);
				expect(timelineRows[0]?.title).toBe("Marksheet committed");

				const timelineExternal = await runMysql<CountRow>(
					"SELECT COUNT(*) AS c FROM sm_student_timelines WHERE staff_student_id = ? AND type = ?",
					[seedIds.studentId, `exam-${seedIds.examTypeId}`],
				);
				expect(Number(timelineExternal[0]?.c ?? 0)).toBe(1);
			});
		} finally {
			if (seedIds) await cleanupSandbox(seedIds);
		}
	});

	it("throws when student.id is missing", async () => {
		await withTenantFixture()(async (fx) => {
			const seedIds = seedIdsFor(fx);
			await seedPrerequisites({ db: fx.db, ids: seedIds });

			const svc = new AssessmentService(fx.provider);
			const marksheet = buildMarksheet(seedIds, { studentId: 0 });

			await expect(
				svc.upsertMarksheet(marksheet, seedIds.staffId),
			).rejects.toThrow("Student ID and Exam Type ID are required");
		});
	});

	it("throws when examTypeId is missing on both examType and student.examId", async () => {
		await withTenantFixture()(async (fx) => {
			const seedIds = seedIdsFor(fx);
			await seedPrerequisites({ db: fx.db, ids: seedIds });

			const svc = new AssessmentService(fx.provider);
			const marksheet = buildMarksheet(seedIds, {
				omitExamType: true,
				examTypeId: 0,
			});

			await expect(
				svc.upsertMarksheet(marksheet, seedIds.staffId),
			).rejects.toThrow("Student ID and Exam Type ID are required");
		});
	});

	it("rolls back when a mid-transaction DB error fires (FK violation on sm_exams.subject_id)", async () => {
		let seedIds: FixtureSeedIds | null = null;
		try {
			await withTenantFixture()(async (fx) => {
				seedIds = seedIdsFor(fx);
				await seedPrerequisites({ db: fx.db, ids: seedIds });

				const preSeededMarkId = 9_000_000 + (seedIds.studentId % 9_999);
				await fx.db.insert(smMarkStores).values({
					id: preSeededMarkId,
					studentRollNo: 1,
					studentAddmissionNo: seedIds.studentId,
					totalMarks: 42,
					isAbsent: 0,
					studentId: seedIds.studentId,
					studentRecordId: seedIds.recordId,
					classId: seedIds.classId,
					sectionId: seedIds.sectionId,
					subjectId: seedIds.subjectId,
					examTermId: seedIds.examTypeId,
					schoolId: seedIds.schoolId,
					academicId: seedIds.academicId,
				});

				const beforeRows = await fx.db
					.select()
					.from(smMarkStores)
					.where(eq(smMarkStores.studentId, seedIds.studentId));
				expect(beforeRows.length).toBe(1);
				expect(Number(beforeRows[0]?.totalMarks)).toBe(42);

				const svc = new AssessmentService(fx.provider);
				const invalidSubjectId = 9_999_999_999;
				const marksheet = buildMarksheet(seedIds, {
					subjectId: invalidSubjectId,
				});

				await expect(
					svc.upsertMarksheet(marksheet, seedIds.staffId),
				).rejects.toThrow();

				const afterRows = await fx.db
					.select()
					.from(smMarkStores)
					.where(eq(smMarkStores.studentId, seedIds.studentId));
				expect(afterRows.length).toBe(1);
				expect(Number(afterRows[0]?.totalMarks)).toBe(42);
				expect(afterRows[0]?.id).toBe(preSeededMarkId);

				const resultRows = await fx.db
					.select()
					.from(smResultStores)
					.where(eq(smResultStores.studentId, seedIds.studentId));
				expect(resultRows.length).toBe(0);

				const timelineRows = await fx.db
					.select()
					.from(smStudentTimelines)
					.where(eq(smStudentTimelines.staffStudentId, seedIds.studentId));
				expect(timelineRows.length).toBe(0);
			});
		} finally {
			if (seedIds) await cleanupSandbox(seedIds);
		}
	});
});
