import { describe, it, expect } from 'vitest';
import { getAllowedCategories, type MentionCategory } from '../../src/routes/api/mentions/search/mention-utils';

describe('@Mention Search API', () => {
	describe('getAllowedCategories', () => {
		const ALL_CATEGORIES: MentionCategory[] = ['students', 'class_section', 'academic_year'];

		it('returns all 3 categories for IT user (designationId 1)', () => {
			const result = getAllowedCategories(1);
			expect(result).toEqual(ALL_CATEGORIES);
		});

		it('returns all 3 categories for Coordinator (designationId 5)', () => {
			const result = getAllowedCategories(5);
			expect(result).toEqual(ALL_CATEGORIES);
		});

		it('returns the same 3 categories for Class Teacher (designationId 8)', () => {
			const result = getAllowedCategories(8);
			expect(result).toEqual(ALL_CATEGORIES);
		});

		it('returns the same 3 categories for any designation (v1 has no role gating)', () => {
			expect(getAllowedCategories(0)).toEqual(ALL_CATEGORIES);
			expect(getAllowedCategories(3)).toEqual(ALL_CATEGORIES);
			expect(getAllowedCategories(10)).toEqual(ALL_CATEGORIES);
			expect(getAllowedCategories(99)).toEqual(ALL_CATEGORIES);
		});

		it('includes students category for all roles', () => {
			expect(getAllowedCategories(1)).toContain('students');
			expect(getAllowedCategories(5)).toContain('students');
			expect(getAllowedCategories(8)).toContain('students');
		});
	});
});
