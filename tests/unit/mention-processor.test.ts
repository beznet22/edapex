/**
 * processMentions — applies @mention tags to a TenantContext.
 *
 * Each mention category maps to a TenantContext field via MENTION_FIELD_MAP:
 *   - schools         -> schoolId
 *   - staff           -> staffId
 *   - students        -> studentId
 *   - class_section   -> classId + sectionId (tuple id)
 *   - academic_year   -> academicId
 *   - exam            -> examTypeId (NOT examId — examTypeId is authoritative)
 *   - file            -> fileRef (file reference payload)
 *
 * Multi-mention messages apply all updates atomically. Cross-school entities
 * raise WorkspaceMismatchError; class_teacher attempting to switch to a
 * different class is blocked by validateWorkspaceLock.
 */
import { describe, it, expect } from 'vitest';
import {
	processMentions,
	MENTION_FIELD_MAP,
	type MentionTag,
	type EntityResolver
} from '$lib/server/mastra/mention-processor';
import { TenantContextCache } from '$lib/server/mastra/context-cache';
import {
	createTenantContext,
	WorkspaceMismatchError,
	type TenantContext
} from '$lib/server/mastra/tenant-context';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';

const baseTenant: TenantContext = createTenantContext({
	schoolId: 1,
	classId: null,
	sectionId: null,
	examId: null,
	examTypeId: null,
	academicId: null,
	studentId: null,
	staffId: 1,
	designationId: ALLOWED_DESIGNATIONS.IT
});

const sameSchoolResolver: EntityResolver = async (_category, id) => ({
	id,
	schoolId: 1,
	classId: null,
	sectionId: null
});

function makeCache(): TenantContextCache {
	return new TenantContextCache();
}

function call(mentions: MentionTag[], tenant = baseTenant, designationId = ALLOWED_DESIGNATIONS.IT) {
	return processMentions(mentions, tenant, makeCache(), 'test-session', designationId, sameSchoolResolver);
}

describe('processMentions', () => {
	it('student mention -> updates studentId', async () => {
		const updated = await call([{ category: 'students', id: 42, name: 'Alice' }]);
		expect(updated.studentId).toBe(42);
		expect(MENTION_FIELD_MAP.students).toBe('studentId');
	});

	it('staff mention -> updates staffId', async () => {
		const updated = await call([{ category: 'staff', id: 7, name: 'Mr. Smith' }]);
		expect(updated.staffId).toBe(7);
	});

	it('class_section mention -> updates BOTH classId and sectionId', async () => {
		const updated = await call([
			{ category: 'class_section', id: { classId: 5, sectionId: 9 }, name: 'Grade 1A' }
		]);
		expect(updated.classId).toBe(5);
		expect(updated.sectionId).toBe(9);
	});

	it('academic_year mention -> updates academicId', async () => {
		const updated = await call([
			{ category: 'academic_year', id: 4, name: 'AY 2024-2025' }
		]);
		expect(updated.academicId).toBe(4);
	});

	it('exam mention -> updates examTypeId (NOT examId)', async () => {
		const updated = await call([{ category: 'exam', id: 6, name: 'CA2' }]);
		expect(updated.examTypeId).toBe(6);
		expect(updated.examId).toBeNull();
		expect(MENTION_FIELD_MAP.exam).toBe('examTypeId');
	});

	it('file mention -> no-op (plumbing lands in M-EDIT-04.5)', async () => {
		const updated = await call([
			{
				category: 'file',
				id: 'photo-abc',
				name: 'photo.jpg',
				fileRef: {
					kind: 'photo',
					url: '/uploads/photo-abc.jpg',
					contentHash: 'sha256:abc',
					mimeType: 'image/jpeg',
					size: 12345
				}
			}
		]);
		expect(updated.schoolId).toBe(baseTenant.schoolId);
		expect(updated.studentId).toBeNull();
	});

	it('schools mention -> updates schoolId', async () => {
		const updated = await call([{ category: 'schools', id: 3, name: 'West Campus' }]);
		expect(updated.schoolId).toBe(3);
	});

	it('multiple mentions apply atomically', async () => {
		const updated = await call([
			{ category: 'students', id: 100, name: 'Alice' },
			{ category: 'class_section', id: { classId: 5, sectionId: 9 }, name: '1A' },
			{ category: 'academic_year', id: 4, name: 'AY 2024-2025' },
			{ category: 'exam', id: 6, name: 'CA2' }
		]);
		expect(updated).toMatchObject({
			studentId: 100,
			classId: 5,
			sectionId: 9,
			academicId: 4,
			examTypeId: 6
		});
	});

	it('cross-school entity -> WorkspaceMismatchError', async () => {
		const crossSchoolResolver: EntityResolver = async (_category, id) => ({
			id,
			schoolId: 999,
			classId: null,
			sectionId: null
		});
		await expect(
			processMentions(
				[{ category: 'students', id: 100, name: 'Bob' }],
				baseTenant,
				makeCache(),
				'test-session',
				ALLOWED_DESIGNATIONS.IT,
				crossSchoolResolver
			)
		).rejects.toBeInstanceOf(WorkspaceMismatchError);
	});

	it('class_teacher attempting to switch to a different class is blocked', async () => {
		const teacherCtx: TenantContext = createTenantContext({
			schoolId: 1,
			classId: 5,
			sectionId: 9,
			designationId: ALLOWED_DESIGNATIONS.CLASS_TEACHER
		});
		await expect(
			call(
				[{ category: 'class_section', id: { classId: 7, sectionId: 10 }, name: '2B' }],
				teacherCtx,
				ALLOWED_DESIGNATIONS.CLASS_TEACHER
			)
		).rejects.toBeInstanceOf(WorkspaceMismatchError);
	});
});
