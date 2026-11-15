/**
 * Diagnostic — prints the active academic year, current examType, LOWER
 * BASIC 2 / section B class tuple, students enrolled, and class teacher.
 * Resolved through the production repository implementations.
 *
 * Gated by RUN_LIVE_E2E because it touches real MySQL.
 * Run with:  RUN_LIVE_E2E=1 pnpm exec vitest run tests/integration/lb2b-state.test.ts
 */
import { describe, it, expect } from 'vitest';
import { getDatabase } from '$lib/server/db';
import { BaseRepository } from '$lib/server/repository/base.repo';
import { ResultsRepository } from '$lib/server/repository/result.repo';
import { StaffRepository } from '$lib/server/repository/staff.repo';
import { StudentRepository } from '$lib/server/repository/student.repo';
import { ScopedRepositoryProvider } from '$lib/server/mastra/scoped-repository';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';

const SCHOOL_ID = 1;

describe('LB2B state (read-only diagnostic)', () => {
	it('prints active academic year + examTypes + LB2B section', async () => {
		const db = await getDatabase();
		const seed = createTenantContext({
			schoolId: SCHOOL_ID,
			userId: 1,
			designationId: ALLOWED_DESIGNATIONS.IT,
			staffId: 1,
			roleId: null,
			classId: null,
			sectionId: null,
			examId: null,
			examTypeId: null,
			academicId: null,
			studentId: null
		});
		const provider = new ScopedRepositoryProvider(db, seed);
		const baseRepo = new BaseRepository(db, seed, provider);
		const resultRepo = new ResultsRepository(db, seed, provider);
		const staffRepo = new StaffRepository(db, seed, provider);
		const studentRepo = new StudentRepository(db, seed, provider);

		const academicId = await baseRepo.getAcademicId();
		console.log('=== Active academic year ===');
		console.log({ academicId });

		const examTypes = await baseRepo.getExamTypes();
		console.log('\n=== Exam types (all) ===');
		console.log(examTypes);

		const currentTerm = await baseRepo.getCurrentTerm();
		console.log('\n=== Current term (canonical) ===');
		console.log(currentTerm);

		const classSections = await resultRepo.getClassSections();
		console.log('\n=== All active class sections ===');
		console.log(classSections);

		const lb2b = classSections.find(
			(c) => c.className?.toUpperCase().includes('LOWER BASIC 2') && c.sectionName === 'B'
		);
		expect(lb2b, 'LOWER BASIC 2 / section B must exist as an active class section').toBeDefined();
		console.log('\n=== LOWER BASIC 2 / B (matched) ===');
		console.log(lb2b);

		const classId = lb2b?.classId;
		const sectionId = lb2b?.sectionId;
		if (classId === null || classId === undefined || sectionId === null || sectionId === undefined) {
			throw new Error('LOWER BASIC 2 B classId or sectionId is null or undefined');
		}

		const students = await studentRepo.getStudentsByClassSection({
			classId,
			sectionId
		});
		console.log('\n=== Students in LOWER BASIC 2 / B ===');
		console.log(students);

		const teacher = await staffRepo.getStaffByClassSection({
			classId,
			sectionId
		});
		console.log('\n=== Class teacher assigned to LOWER BASIC 2 / B ===');
		console.log(teacher);
	}, 60_000);
});
