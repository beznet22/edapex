/**
 * @Mention entity categories available for autocomplete search.
 */
export type MentionCategory =
	| 'schools'
	| 'students'
	| 'classes'
	| 'sections'
	| 'academic_year'
	| 'term';

/**
 * Result shape returned by the mention search endpoint.
 */
export interface MentionSearchResult {
	id: number;
	name: string;
	category: string;
	typeBadge: string;
	parentContext?: string;
}

/**
 * Returns the list of entity categories a user is allowed to search,
 * based on their designation role.
 *
 * - Coordinator (5) and IT (1): all 6 categories
 * - Class Teacher (8): students, academic_year, term
 * - All others: no categories (empty array)
 */
export function getAllowedCategories(designationId: number): MentionCategory[] {
	if (designationId === 1 || designationId === 5) {
		return ['schools', 'students', 'classes', 'sections', 'academic_year', 'term'];
	}
	if (designationId === 8) {
		return ['students', 'academic_year', 'term'];
	}
	return [];
}
