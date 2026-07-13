/**
 * Tenant fixture factories for live E2E tests.
 *
 * Two personas mirror the production privacy contract:
 *
 *   1. Admin/IT persona     - `designationId = IT`. Free to select any class via
 *                              the `selected-class` cookie. `assignedClass = null`.
 *   2. Class Teacher persona - `designationId = CLASS_TEACHER`. Locked to the
 *                              class assigned during on-boarding. Cannot use
 *                              `staff` or `schools` mention categories.
 *
 * All lookups go through the production repository implementations
 * (`StudentRepository`, `BaseRepository`, `ResultsRepository`,
 * `StaffRepository`) so the same code path the workflow exercises is the
 * path the tests exercise. Bypassing these with raw Drizzle queries would
 * let a regression in the repository slip past.
 *
 * `examId` is intentionally NOT resolved - `examTypeId` is the authoritative
 * term identifier (per product spec). The returned TenantContext always carries
 * `examId: null`.
 *
 * The `getModelForTest` helper resolves a model via the production catalog
 * (`resolveModelForRequest`) so tests exercise the same provider abstraction
 * the chatWorkflow uses at runtime - no mock model factories, no shortcut
 * around the catalog. The default model id is `kimchi/minmax-m3` (set in the
 * catalog's `DEFAULT_MODEL_ID`); override by passing a different model id.
 */
import { getDatabase } from '$lib/server/db';
import { BaseRepository } from '$lib/server/repository/base.repo';
import { StudentRepository } from '$lib/server/repository/student.repo';
import { ResultsRepository } from '$lib/server/repository/result.repo';
import { StaffRepository } from '$lib/server/repository/staff.repo';
import { ScopedRepositoryProvider } from '$lib/server/mastra/scoped-repository';
import {
	createTenantContext,
	type TenantContext
} from '$lib/server/mastra/tenant-context';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';
import { resolveModelForRequest } from '$lib/server/mastra/provider';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { env as svelteEnv } from '$env/dynamic/private';
import type { MastraModelConfig } from '@mastra/core/llm';

/**
 * The dev MySQL `devdb` always has school id 1. Hardcoding it here avoids a
 * raw `SELECT FROM sm_schools` and lets the fixture bootstrap from a
 * constant — the production `/api/chat` route resolves schoolId from the
 * session user, which this fixture does NOT exercise (we synthesize a
 * tenant context directly).
 */
const FIXTURE_SCHOOL_ID = 1;
/** Default user id used by the fixture tenant. Matches the dev seed. */
const FIXTURE_USER_ID = 1;
/** Default staff id used when the fixture has no teacher lookup result. */
const FIXTURE_STAFF_ID = 1;

export const TEST_MODEL_ID = 'kimchi/minimax-m3';

export interface ResolvedFixture {
	readonly schoolId: number;
	readonly classId: number;
	readonly sectionId: number;
	readonly examTypeId: number;
	readonly academicId: number;
	readonly staffId: number;
	readonly userId: number;
	readonly studentId: number;
	readonly designationId: number;
}

let cached: ResolvedFixture | null = null;

async function discoverFixture(): Promise<ResolvedFixture> {
	if (cached) return cached;
	const db = await getDatabase();
	const schoolId = FIXTURE_SCHOOL_ID;

	const seedTenant = createTenantContext({
		schoolId,
		userId: FIXTURE_USER_ID,
		designationId: ALLOWED_DESIGNATIONS.IT,
		staffId: FIXTURE_STAFF_ID,
		roleId: null,
		classId: null,
		sectionId: null,
		examId: null,
		examTypeId: null,
		academicId: null,
		studentId: null
	});
	const provider = new ScopedRepositoryProvider(db, seedTenant);

	const baseRepo = new BaseRepository(db, seedTenant, provider);
	const resultRepo = new ResultsRepository(db, seedTenant, provider);
	const staffRepo = new StaffRepository(db, seedTenant, provider);
	const studentRepo = new StudentRepository(db, seedTenant, provider);

	// `getAcademicId()` is the canonical way to resolve the active academic
	// year for the tenant's school — the same call `(chat)/+layout.server.ts`
	// uses to populate the chat UI's academic-year dropdown.
	const academicId = await baseRepo.getAcademicId();

	// `getClassSections()` is the same call production uses to populate the
	// `class-selector.svelte` dropdown. Scoped to active classes + sections
	// for the current academic year, so picking the first one is exactly
	// what the UI would offer.
	const classSections = await resultRepo.getClassSections();
	// The Al-Azeem screenshot represents LOWER BASIC 2 / section B (the
	// 2nd-term marksheet fixture in `static/marksheets/Al-Azeem.jpg.jpeg`).
	// Picking the LOWER BASIC 2B tuple here keeps the test pinned to that
	// exact fixture; if a future migration renumbers classId/sectionId,
	// update this lookup to match. Falling back to the first active section
	// keeps the suite runnable on fresh databases where the Al-Azeem data
	// may not be seeded yet.
	const alAzeem = classSections.find(
		(c) => c.className?.toUpperCase().includes('LOWER BASIC 2') && c.sectionName === 'B'
	);
	const firstSection = alAzeem ?? classSections[0];
	if (!firstSection) {
		throw new Error(
			`No active class sections found for schoolId=${schoolId}, academicId=${academicId}. Live E2E tests require at least one active (class, section).`
		);
	}
	if (
		firstSection.classId === null ||
		firstSection.classId === undefined ||
		firstSection.sectionId === null ||
		firstSection.sectionId === undefined
	) {
		throw new Error(
			`Invalid class section tuple for schoolId=${schoolId}, academicId=${academicId}`
		);
	}
	const classId = firstSection.classId;
	const sectionId = firstSection.sectionId;

	// Pick the 2nd-term examType for this academic year, falling back to the
	// most recently created active exam type. Al-Azeem.jpg.jpeg is a 2nd-term
	// marksheet, so we prefer the term whose title matches "second" / "2nd";
	// `getCurrentTerm()` then resolves the canonical id scoped to the
	// current academic year (the same call production uses when no
	// examId cookie is present).
	const examTypes = await baseRepo.getExamTypes();
	const secondTerm = examTypes.find((e) => /SECOND|2ND/i.test(e.title ?? ''));
	const examTypeId = secondTerm
		? (await baseRepo.getCurrentTerm(secondTerm.id))?.id ?? secondTerm.id
		: (await baseRepo.getCurrentTerm())?.id ?? examTypes[0]?.id ?? 0;

	// Pick the actual subject teacher assigned to teach this
	// (class, section). `getStaffByClassSection` is the same call the
	// production staff UI uses; this guarantees the class_teacher persona
	// will pass the production tenant verification (`verifyTeacherAssignment`
	// is the production gate, and it looks for the same join).
	const subjectTeacher = await staffRepo.getStaffByClassSection({ classId, sectionId });
	const staffId = subjectTeacher?.teacherId ?? FIXTURE_STAFF_ID;
	if (!subjectTeacher) {
		console.warn(
			`[tenant-fixture] no subject teacher found for classId=${classId}, sectionId=${sectionId}; falling back to FIXTURE_STAFF_ID=${FIXTURE_STAFF_ID}. ` +
				`The class_teacher persona may fail production verification.`
		);
	}

	// Find a student in that (class, section) for the test fixture. Same
	// call the production UI uses to populate the @mention student list.
	const students = await studentRepo.getStudentsByClassSection({ classId, sectionId });
	const studentId = (students as Array<{ id: number }>)[0]?.id ?? 0;

	const result: ResolvedFixture = {
		schoolId,
		classId,
		sectionId,
		examTypeId,
		academicId,
		staffId,
		userId: FIXTURE_USER_ID,
		studentId,
		designationId: ALLOWED_DESIGNATIONS.IT
	};
	cached = result;
	return result;
}

/**
 * Admin/IT persona - has all 7 mention categories and is free to select any class.
 *
 * The persona always has an active (classId, sectionId, examTypeId, academicId)
 * tuple because the production `class-selector.svelte` UI forces admins and
 * coordinators to pick a class before they can run the chat workflow. Without
 * an active class the workspace resolver falls back to `_system/`, which is
 * not where OCR markdown or class-scoped data lives. The persona picks the
 * SAME (classId, sectionId) tuple `makeClassTeacherPersona` uses so the
 * workspace is the same for both personas — only `designationId` differs.
 */
export async function makeAdminPersona(): Promise<TenantContext> {
	const f = await discoverFixture();
	return createTenantContext({
		schoolId: f.schoolId,
		userId: f.userId,
		designationId: ALLOWED_DESIGNATIONS.IT,
		staffId: f.staffId,
		roleId: null,
		classId: f.classId,
		sectionId: f.sectionId,
		examId: null,
		examTypeId: f.examTypeId,
		academicId: f.academicId,
		studentId: null
	});
}

/**
 * Class Teacher persona - locked to assignedClass = activeClass = selectedClass.
 * Has only 5 mention categories (no `staff`, no `schools`).
 */
export async function makeClassTeacherPersona(): Promise<TenantContext> {
	const f = await discoverFixture();
	return createTenantContext({
		schoolId: f.schoolId,
		userId: f.userId,
		designationId: ALLOWED_DESIGNATIONS.CLASS_TEACHER,
		staffId: f.staffId,
		roleId: null,
		classId: f.classId,
		sectionId: f.sectionId,
		examId: null,
		examTypeId: f.examTypeId,
		academicId: f.academicId,
		studentId: f.studentId
	});
}

export async function getFixture(): Promise<ResolvedFixture> {
	return discoverFixture();
}

/**
 * Resolves the production model config via the catalog + provider resolver.
 * This is the SAME call the chatWorkflow route handler makes on every request
 * via `resolveModelForRequest`. Tests must use this so they exercise the
 * real provider abstraction, not a mock.
 */
export async function getModelForTest(
	userId: number,
	modelId: string = TEST_MODEL_ID
): Promise<MastraModelConfig> {
	const db = getAppDb();
	const env = svelteEnv as Record<string, string | undefined>;
	const resolved = await resolveModelForRequest(userId, modelId, db);
	return resolved.config;
}
