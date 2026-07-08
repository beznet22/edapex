/**
 * @Mention entity categories available in the editor's @mention popup (v2 taxonomy).
 *
 * The editor surfaces structured entities the LLM cannot infer from the
 * document's own content. The downstream chat agent resolves class/section/
 * exam/exam at chat time from its own tenantContext, so the editor only
 * carries the following category groups:
 *
 *   schools         — a specific school in the multi-tenant network.
 *   staff           — a teacher or staff member (name + designation).
 *   students        — a specific student (admission number embedded in the
 *                     display label). Scoped to the user's currently selected
 *                     class+section, or to all students in the school for
 *                     privileged roles.
 *   class_section   — a composite (classId, sectionId) reference resolved by
 *                     the chat agent from the active tenantContext.
 *   academic_year   — a specific academic year (id + label).
 *   exam            — an exam exam resolved by the agent via examTypeId.
 *   file            — a workspace file (id + path); the agent's scope guard
 *                     validates visibility before any read or write.
 *
 * Each @Mention tag carries a `category` discriminator plus a typed `id`
 * whose shape varies by category — see {@link MentionSearchResult}.
 */
export type MentionCategory = 'schools' | 'staff' | 'students' | 'class_section' | 'academic_year' | 'exam' | 'file';

/**
 * Result shape returned by the mention search endpoint.
 *
 * The `id` union matches the on-the-wire representation per category:
 *   - numeric ids: schools, staff, students, academic_year, exam
 *   - string ids:  file (workspace file id encoded as a path-safe string)
 *   - composite:   class_section ({ classId, sectionId })
 */
export interface MentionSearchResult {
	id: number | string | { classId: number; sectionId: number };
	name: string;
	category: MentionCategory;
	typeBadge: string;
	parentContext?: string;
	/**
	 * Structured fields for `students` mentions — embedded in the markdown
	 * as `{{student:<studentId>|<admissionNo>}}` so the backend workflow can
	 * resolve the document to a `sm_students` row without an extra lookup.
	 * Only populated when `category === 'students'`.
	 */
	admissionNo?: string;
	studentId?: number;
}

/**
 * Returns the mention categories available to a user based on their role.
 *
 * v2 taxonomy — role-scoped (replaces v1 where every authenticated user saw
 * the full list). Privileged roles (IT, Coordinator) see every category;
 * Class Teacher sees the pedagogical subset only. Any other designation
 * returns an empty list — those users cannot open the @mention popup.
 */
export function getAllowedCategories(designationId: number): MentionCategory[] {
	const ALLOWED_DESIGNATIONS = { IT: 1, COORDINATOR: 5, CLASS_TEACHER: 8 } as const;
	if (designationId === ALLOWED_DESIGNATIONS.IT || designationId === ALLOWED_DESIGNATIONS.COORDINATOR) {
		return ['schools', 'staff', 'students', 'class_section', 'academic_year', 'exam', 'file'];
	}
	if (designationId === ALLOWED_DESIGNATIONS.CLASS_TEACHER) {
		return ['students', 'class_section', 'academic_year', 'exam', 'file'];
	}
	return [];
}
