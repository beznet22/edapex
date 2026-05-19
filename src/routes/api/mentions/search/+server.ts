import { error, json, type RequestHandler } from '@sveltejs/kit';
import { createTenantContext, type TenantContext } from '$lib/server/mastra/tenant-context';

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

/**
 * Searches entities in the school database scoped to the user's context.
 *
 * TODO: Implement actual DB queries against the school database once schema is confirmed.
 * For now, returns an empty array with the correct structure.
 *
 * For Class Teachers searching students, results are filtered by classId and sectionId
 * from the tenantContext.
 */
async function searchEntities(
	query: string,
	category: MentionCategory | null,
	tenantContext: TenantContext,
	limit: number
): Promise<MentionSearchResult[]> {
	// TODO: Replace with actual Drizzle ORM queries against the school database.
	// Queries should:
	// 1. Filter by tenantContext.schoolId for all categories
	// 2. For Class Teachers (designationId 8) searching students,
	//    additionally filter by tenantContext.classId and tenantContext.sectionId
	// 3. Apply LIKE/fuzzy matching on the entity name using `query`
	// 4. Sort by relevance (exact prefix matches first, then partial matches)
	// 5. Limit results to `limit` (max 10)
	//
	// Example query structure per category:
	// - schools: SELECT id, school_name FROM schools WHERE school_name LIKE '%query%' AND id = schoolId
	// - students: SELECT id, full_name FROM students WHERE full_name LIKE '%query%' AND school_id = schoolId
	// - classes: SELECT id, class_name FROM classes WHERE class_name LIKE '%query%' AND school_id = schoolId
	// - sections: SELECT id, section_name FROM sections WHERE section_name LIKE '%query%' AND school_id = schoolId
	// - academic_year: SELECT id, title FROM academic_years WHERE title LIKE '%query%' AND school_id = schoolId
	// - term: SELECT id, exam_name FROM exams WHERE exam_name LIKE '%query%' AND school_id = schoolId

	return [];
}

/**
 * GET /api/mentions/search?q=john&category=students&limit=10
 *
 * Searches for mentionable entities scoped to the user's role and school.
 *
 * Query params:
 * - q: search query string (optional, defaults to '')
 * - category: entity category to search (optional, searches allowed categories if omitted)
 * - limit: max results to return (optional, defaults to 10, capped at 10)
 *
 * Returns:
 * - 401 if user is not authenticated
 * - 403 if requested category is not in the user's allowed list
 * - 200 with { results: MentionSearchResult[] }
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = locals;
	if (!user) {
		error(401, 'Authentication required');
	}

	const query = url.searchParams.get('q') || '';
	const category = url.searchParams.get('category') as MentionCategory | null;
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 10);

	const designationId: number = (user as any).designationId ?? 1;

	// Validate category against role-based allowed list
	const allowedCategories = getAllowedCategories(designationId);
	if (category && !allowedCategories.includes(category)) {
		return json({ error: 'FORBIDDEN' }, { status: 403 });
	}

	// Build tenant context for scoped queries
	const tenantContext = createTenantContext({
		schoolId: user.schoolId ?? 1,
		userId: user.id ?? 1,
		designationId,
		staffId: (user as any).staffId ?? 1,
		roleId: (user as any).roleId ?? null,
		classId: (user as any).classId ?? null,
		sectionId: (user as any).sectionId ?? null,
		examId: null,
		academicId: user.academicId ?? null
	});

	const results = await searchEntities(query, category, tenantContext, limit);
	return json({ results });
};
