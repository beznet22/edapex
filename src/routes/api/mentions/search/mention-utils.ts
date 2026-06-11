/**
 * @Mention entity categories available in the editor's @mention popup.
 *
 * The editor's mentions are deliberately scoped to the document's content,
 * NOT to tenant metadata. The downstream chat agent resolves class/section/
 * exam/term at chat time from its own tenantContext, so the editor only
 * needs to carry entities the LLM cannot infer from context:
 *
 *   students — a specific student referenced by name (and admission number
 *              embedded in the display label). Scoped to the user's currently
 *              selected class+section, or to all students in the school for
 *              privileged roles.
 *   date     — an explicit date token (today, tomorrow, or a YYYY-MM-DD value).
 *   custom   — a free-form inline variable the user typed without picking a
 *              structured entity. Pass-through placeholder; the LLM treats
 *              it as literal text.
 */
export type MentionCategory = 'students' | 'date' | 'custom';

/**
 * Result shape returned by the mention search endpoint.
 */
export interface MentionSearchResult {
	id: number | string;
	name: string;
	category: string;
	typeBadge: string;
	parentContext?: string;
}

/**
 * Returns the list of mention categories available to a user.
 *
 * v1: all three categories are available to all authenticated users. The
 * server still scopes `students` searches by the user's schoolId (and by
 * class+section when the editor has those set).
 */
export function getAllowedCategories(_designationId: number): MentionCategory[] {
	return ['students', 'date', 'custom'];
}
