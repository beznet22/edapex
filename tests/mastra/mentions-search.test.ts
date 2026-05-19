import { describe, it, expect } from 'vitest';
import { getAllowedCategories, type MentionCategory } from '../../src/routes/api/mentions/search/+server';

describe('@Mention Search API', () => {
	describe('getAllowedCategories', () => {
		const ALL_CATEGORIES: MentionCategory[] = [
			'schools',
			'students',
			'classes',
			'sections',
			'academic_year',
			'term'
		];

		const CLASS_TEACHER_CATEGORIES: MentionCategory[] = ['students', 'academic_year', 'term'];

		it('returns all 6 categories for IT user (designationId 1)', () => {
			const result = getAllowedCategories(1);
			expect(result).toEqual(ALL_CATEGORIES);
		});

		it('returns all 6 categories for Coordinator (designationId 5)', () => {
			const result = getAllowedCategories(5);
			expect(result).toEqual(ALL_CATEGORIES);
		});

		it('returns restricted 3 categories for Class Teacher (designationId 8)', () => {
			const result = getAllowedCategories(8);
			expect(result).toEqual(CLASS_TEACHER_CATEGORIES);
		});

		it('returns empty array for unknown designation', () => {
			expect(getAllowedCategories(0)).toEqual([]);
			expect(getAllowedCategories(3)).toEqual([]);
			expect(getAllowedCategories(10)).toEqual([]);
			expect(getAllowedCategories(99)).toEqual([]);
		});

		it('Class Teacher cannot access schools, classes, or sections', () => {
			const result = getAllowedCategories(8);
			expect(result).not.toContain('schools');
			expect(result).not.toContain('classes');
			expect(result).not.toContain('sections');
		});

		it('Coordinator has access to students category', () => {
			const result = getAllowedCategories(5);
			expect(result).toContain('students');
		});

		it('IT user has access to all categories including schools', () => {
			const result = getAllowedCategories(1);
			expect(result).toContain('schools');
			expect(result).toContain('students');
			expect(result).toContain('classes');
			expect(result).toContain('sections');
			expect(result).toContain('academic_year');
			expect(result).toContain('term');
		});
	});
});
