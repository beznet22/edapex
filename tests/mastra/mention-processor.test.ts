import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		DATABASE_URL: 'mysql://test:test@localhost:3306/test',
		TOKEN_ENCRYPTION_KEY: 'test-encryption-key-32-chars-ok!'
	}
}));

import {
	processMentions,
	MENTION_FIELD_MAP,
	type MentionTag,
	type EntityResolver,
	type ResolvedEntity
} from '../../src/lib/server/mastra/mention-processor';
import { createTenantContext, WorkspaceMismatchError } from '../../src/lib/server/mastra/tenant-context';
import { TenantContextCache } from '../../src/lib/server/mastra/context-cache';

describe('mention-processor', () => {
	let cache: TenantContextCache;
	const sessionId = 'test-session-123';

	// Default tenant context for a Coordinator (designationId 5)
	const baseContext = createTenantContext({
		schoolId: 1,
		classId: 10,
		sectionId: 20,
		examId: 30,
		academicId: 40,
		studentId: null,
		userId: 100,
		staffId: 200,
		designationId: 5
	});

	// Class Teacher context (designationId 8)
	const classTeacherContext = createTenantContext({
		schoolId: 1,
		classId: 10,
		sectionId: 20,
		examId: 30,
		academicId: 40,
		studentId: null,
		userId: 101,
		staffId: 201,
		designationId: 8
	});

	// Mock entity resolver that returns entities in school 1
	const mockResolver: EntityResolver = async (category: string, id: number) => {
		return { id, schoolId: 1, classId: 10, sectionId: 20 };
	};

	// Resolver that returns entities in a different school
	const crossSchoolResolver: EntityResolver = async (category: string, id: number) => {
		return { id, schoolId: 999, classId: null, sectionId: null };
	};

	// Resolver for students in a different class
	const differentClassResolver: EntityResolver = async (category: string, id: number) => {
		if (category === 'students') {
			return { id, schoolId: 1, classId: 50, sectionId: 60 };
		}
		return { id, schoolId: 1, classId: null, sectionId: null };
	};

	beforeEach(() => {
		cache = new TenantContextCache();
	});

	describe('MENTION_FIELD_MAP', () => {
		it('maps all 6 categories to correct TenantContext fields', () => {
			expect(MENTION_FIELD_MAP.schools).toBe('schoolId');
			expect(MENTION_FIELD_MAP.students).toBe('studentId');
			expect(MENTION_FIELD_MAP.classes).toBe('classId');
			expect(MENTION_FIELD_MAP.sections).toBe('sectionId');
			expect(MENTION_FIELD_MAP.academic_year).toBe('academicId');
			expect(MENTION_FIELD_MAP.term).toBe('examId');
		});
	});

	describe('processMentions - basic behavior', () => {
		it('returns existing context when no mentions provided', async () => {
			const result = await processMentions([], baseContext, cache, sessionId, 5, mockResolver);
			expect(result).toEqual(baseContext);
		});

		it('updates studentId when a student mention is provided', async () => {
			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'John Doe' }
			];

			const result = await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(result.studentId).toBe(501);
			// Other fields remain unchanged
			expect(result.schoolId).toBe(1);
			expect(result.classId).toBe(10);
			expect(result.sectionId).toBe(20);
		});

		it('updates classId when a class mention is provided', async () => {
			const mentions: MentionTag[] = [
				{ category: 'classes', id: 15, name: 'Class 10A' }
			];

			const result = await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(result.classId).toBe(15);
		});

		it('updates sectionId when a section mention is provided', async () => {
			const mentions: MentionTag[] = [
				{ category: 'sections', id: 25, name: 'Section B' }
			];

			const result = await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(result.sectionId).toBe(25);
		});

		it('updates academicId when an academic_year mention is provided', async () => {
			const mentions: MentionTag[] = [
				{ category: 'academic_year', id: 45, name: '2024-2025' }
			];

			const result = await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(result.academicId).toBe(45);
		});

		it('updates examId when a term mention is provided', async () => {
			const mentions: MentionTag[] = [
				{ category: 'term', id: 35, name: 'Term 2' }
			];

			const result = await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(result.examId).toBe(35);
		});
	});

	describe('processMentions - left-to-right override', () => {
		it('later mention overrides earlier mention for the same field', async () => {
			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'John Doe' },
				{ category: 'students', id: 502, name: 'Jane Smith' }
			];

			const result = await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(result.studentId).toBe(502);
		});

		it('applies multiple different category mentions correctly', async () => {
			const mentions: MentionTag[] = [
				{ category: 'classes', id: 15, name: 'Class 10A' },
				{ category: 'sections', id: 25, name: 'Section B' },
				{ category: 'students', id: 501, name: 'John Doe' }
			];

			const result = await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(result.classId).toBe(15);
			expect(result.sectionId).toBe(25);
			expect(result.studentId).toBe(501);
		});

		it('last mention wins when multiple target the same field', async () => {
			const mentions: MentionTag[] = [
				{ category: 'term', id: 31, name: 'Term 1' },
				{ category: 'term', id: 32, name: 'Term 2' },
				{ category: 'term', id: 33, name: 'Term 3' }
			];

			const result = await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(result.examId).toBe(33);
		});
	});

	describe('processMentions - workspace validation', () => {
		it('throws WorkspaceMismatchError when entity belongs to different school', async () => {
			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'Foreign Student' }
			];

			await expect(
				processMentions(mentions, baseContext, cache, sessionId, 5, crossSchoolResolver)
			).rejects.toThrow(WorkspaceMismatchError);
		});

		it('preserves existing context when validation fails', async () => {
			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'Foreign Student' }
			];

			try {
				await processMentions(mentions, baseContext, cache, sessionId, 5, crossSchoolResolver);
			} catch (e) {
				// Context should remain unchanged
				expect(baseContext.studentId).toBeNull();
				expect(baseContext.classId).toBe(10);
			}
		});

		it('rejects all mentions atomically if any one fails validation', async () => {
			// First mention is valid (school 1), second is invalid (school 999)
			let callCount = 0;
			const mixedResolver: EntityResolver = async (category, id) => {
				callCount++;
				if (callCount === 2) {
					return { id, schoolId: 999, classId: null, sectionId: null };
				}
				return { id, schoolId: 1, classId: 10, sectionId: 20 };
			};

			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'Valid Student' },
				{ category: 'classes', id: 15, name: 'Foreign Class' }
			];

			await expect(
				processMentions(mentions, baseContext, cache, sessionId, 5, mixedResolver)
			).rejects.toThrow(WorkspaceMismatchError);
		});

		it('error message includes entity name and category', async () => {
			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'Foreign Student' }
			];

			try {
				await processMentions(mentions, baseContext, cache, sessionId, 5, crossSchoolResolver);
				expect.fail('Should have thrown');
			} catch (e) {
				expect(e).toBeInstanceOf(WorkspaceMismatchError);
				expect((e as Error).message).toContain('Foreign Student');
				expect((e as Error).message).toContain('students');
			}
		});
	});

	describe('processMentions - cache busting on class change', () => {
		it('busts cache when classId changes', async () => {
			cache.set(sessionId, baseContext);
			expect(cache.has(sessionId)).toBe(true);

			const mentions: MentionTag[] = [
				{ category: 'classes', id: 15, name: 'New Class' }
			];

			await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(cache.has(sessionId)).toBe(false);
		});

		it('does not bust cache when classId stays the same', async () => {
			cache.set(sessionId, baseContext);
			expect(cache.has(sessionId)).toBe(true);

			const mentions: MentionTag[] = [
				{ category: 'classes', id: 10, name: 'Same Class' } // same as baseContext.classId
			];

			await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(cache.has(sessionId)).toBe(true);
		});

		it('does not bust cache when only studentId changes', async () => {
			cache.set(sessionId, baseContext);
			expect(cache.has(sessionId)).toBe(true);

			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'John Doe' }
			];

			await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(cache.has(sessionId)).toBe(true);
		});
	});

	describe('processMentions - Class Teacher restrictions', () => {
		it('Class Teacher can update studentId', async () => {
			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'John Doe' }
			];

			const result = await processMentions(
				mentions, classTeacherContext, cache, sessionId, 8, mockResolver
			);
			expect(result.studentId).toBe(501);
		});

		it('Class Teacher can update academicId', async () => {
			const mentions: MentionTag[] = [
				{ category: 'academic_year', id: 45, name: '2024-2025' }
			];

			const result = await processMentions(
				mentions, classTeacherContext, cache, sessionId, 8, mockResolver
			);
			expect(result.academicId).toBe(45);
		});

		it('Class Teacher can update examId', async () => {
			const mentions: MentionTag[] = [
				{ category: 'term', id: 35, name: 'Term 2' }
			];

			const result = await processMentions(
				mentions, classTeacherContext, cache, sessionId, 8, mockResolver
			);
			expect(result.examId).toBe(35);
		});

		it('Class Teacher cannot update classId — field is silently skipped', async () => {
			const mentions: MentionTag[] = [
				{ category: 'classes', id: 15, name: 'Other Class' }
			];

			const result = await processMentions(
				mentions, classTeacherContext, cache, sessionId, 8, mockResolver
			);
			// classId should remain unchanged
			expect(result.classId).toBe(10);
		});

		it('Class Teacher cannot update sectionId — field is silently skipped', async () => {
			const mentions: MentionTag[] = [
				{ category: 'sections', id: 25, name: 'Other Section' }
			];

			const result = await processMentions(
				mentions, classTeacherContext, cache, sessionId, 8, mockResolver
			);
			// sectionId should remain unchanged
			expect(result.sectionId).toBe(20);
		});

		it('Class Teacher cannot update schoolId — field is silently skipped', async () => {
			const mentions: MentionTag[] = [
				{ category: 'schools', id: 2, name: 'Other School' }
			];

			// Resolver returns school 1 (same as context) so validation passes
			const sameSchoolResolver: EntityResolver = async (category, id) => {
				return { id, schoolId: 1, classId: null, sectionId: null };
			};

			const result = await processMentions(
				mentions, classTeacherContext, cache, sessionId, 8, sameSchoolResolver
			);
			// schoolId should remain unchanged
			expect(result.schoolId).toBe(1);
		});

		it('Class Teacher student mention rejected if student not in assigned class', async () => {
			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'Wrong Class Student' }
			];

			await expect(
				processMentions(
					mentions, classTeacherContext, cache, sessionId, 8, differentClassResolver
				)
			).rejects.toThrow(WorkspaceMismatchError);
		});

		it('Class Teacher student rejection message mentions class/section', async () => {
			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'Wrong Class Student' }
			];

			try {
				await processMentions(
					mentions, classTeacherContext, cache, sessionId, 8, differentClassResolver
				);
				expect.fail('Should have thrown');
			} catch (e) {
				expect(e).toBeInstanceOf(WorkspaceMismatchError);
				expect((e as Error).message).toContain('Wrong Class Student');
				expect((e as Error).message).toContain('class/section');
			}
		});
	});

	describe('processMentions - immutability', () => {
		it('returns a new frozen TenantContext object', async () => {
			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'John Doe' }
			];

			const result = await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(result).not.toBe(baseContext);
			expect(Object.isFrozen(result)).toBe(true);
		});

		it('does not mutate the original context', async () => {
			const mentions: MentionTag[] = [
				{ category: 'classes', id: 15, name: 'New Class' }
			];

			await processMentions(mentions, baseContext, cache, sessionId, 5, mockResolver);
			expect(baseContext.classId).toBe(10); // unchanged
		});
	});

	describe('processMentions - blocking behavior', () => {
		it('validates all entities before applying any updates', async () => {
			// If the second mention fails, the first should not be applied
			let callCount = 0;
			const failOnSecondResolver: EntityResolver = async (category, id) => {
				callCount++;
				if (callCount === 2) {
					return { id, schoolId: 999, classId: null, sectionId: null };
				}
				return { id, schoolId: 1, classId: 10, sectionId: 20 };
			};

			const mentions: MentionTag[] = [
				{ category: 'students', id: 501, name: 'Valid Student' },
				{ category: 'term', id: 35, name: 'Invalid Term' }
			];

			await expect(
				processMentions(mentions, baseContext, cache, sessionId, 5, failOnSecondResolver)
			).rejects.toThrow(WorkspaceMismatchError);

			// Original context is preserved (no partial updates)
			expect(baseContext.studentId).toBeNull();
			expect(baseContext.examId).toBe(30);
		});
	});
});
