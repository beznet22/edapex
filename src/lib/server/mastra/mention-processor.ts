// Verified: no native Mastra API for @mention context injection as of @mastra/core@0.10.x
// Custom processMentions() implementation for role-based entity resolution and TenantContext switching.

import {
	type TenantContext,
	createTenantContext,
	WorkspaceMismatchError
} from './tenant-context';
import type { TenantContextCache } from './context-cache';
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";

/**
 * Represents a parsed @mention tag from the chat message.
 */
export interface MentionTag {
	category:
		| 'students'
		| 'staff'
		| 'schools'
		| 'class_section'
		| 'academic_year'
		| 'exam'
		| 'file';
	id: number | string | { classId: number; sectionId: number };
	name: string;
	parentContext?: string;
	/** For photo fileReferences attached to the message */
	fileRef?: {
		kind: 'photo';
		url: string;
		contentHash: string;
		mimeType: string;
		size: number;
	};
}

/**
 * Maps mention categories to their corresponding TenantContext field.
 */
export const MENTION_FIELD_MAP: Record<string, keyof TenantContext | 'fileRef'> = {
	schools: 'schoolId',
	staff: 'staffId',
	students: 'studentId',
	class_section: 'classId',
	academic_year: 'academicId',
	exam: 'examTypeId',
	file: 'fileRef',
};

/**
 * Entity resolution result from database lookup.
 * Stubbed for now — will be replaced with actual DB queries.
 */
export interface ResolvedEntity {
	id: number;
	schoolId: number;
	classId?: number | null;
	sectionId?: number | null;
}

/**
 * Entity resolver function type.
 * Accepts a category and entity ID, returns the resolved entity with its schoolId.
 * This is injectable for testing purposes.
 */
export type EntityResolver = (
	category: string,
	id: number
) => Promise<ResolvedEntity>;

/**
 * Default stub entity resolver.
 * In production, this will query the school database to validate entity ownership.
 */
export async function defaultEntityResolver(
	category: string,
	id: number
): Promise<ResolvedEntity> {
	// Stub: assumes entity belongs to school 1 with no class/section context.
	// TODO: Replace with actual DB lookups per category:
	// - schools: query schools table
	// - students: query students table (includes classId, sectionId)
	// - classes: query classes table
	// - sections: query sections table
	// - academic_year: query academic_years table
	// - exam: query exam_types table
	return { id, schoolId: 1, classId: null, sectionId: null };
}

function isClassSectionId(
	id: MentionTag['id']
): id is { classId: number; sectionId: number } {
	return (
		typeof id === 'object' &&
		id !== null &&
		'classId' in id &&
		'sectionId' in id
	);
}

/**
 * Process @mention tags from a chat message, validate entity ownership,
 * and update the TenantContext accordingly.
 *
 * Key behaviors:
 * 1. Applies mentions left-to-right, each overriding the same field if set by a prior mention
 * 2. Validates each entity belongs to user's schoolId
 * 3. If validation fails → throws WorkspaceMismatchError, preserves existing context
 * 4. If class changes → busts context cache via cache.bustCache(sessionId)
 * 5. For Class Teachers (designationId 8): only updates studentId, academicId, examId — never classId/sectionId
 * 6. For Class Teachers: validates student is in their assigned class/section
 *
 * TODO(M-EDIT-04.2): file category plumbing requires `requestContext` to be threaded through this
 * function's signature. File mentions should route via `requestContext.set('fileRef', mention)`
 * rather than mutating TenantContext. Until the signature is extended, file mentions are skipped
 * (validation placeholder carries the active schoolId, application loop drops them).
 *
 * @param mentions - Array of MentionTag objects parsed from the message
 * @param tenantContext - Current immutable TenantContext
 * @param cache - TenantContextCache instance for cache busting
 * @param sessionId - Current session ID for cache operations
 * @param designationId - User's designation ID for role-based restrictions
 * @param resolveEntity - Injectable entity resolver (defaults to stub)
 * @returns Updated TenantContext with mention-driven field changes
 * @throws WorkspaceMismatchError if any entity fails school validation
 */
export async function processMentions(
	mentions: MentionTag[],
	tenantContext: TenantContext,
	cache: TenantContextCache,
	sessionId: string,
	designationId: number,
	resolveEntity: EntityResolver = defaultEntityResolver
): Promise<TenantContext> {
	if (mentions.length === 0) {
		return tenantContext;
	}

	// Build a mutable copy of context fields for left-to-right application
	const updatedFields: Record<string, number | null> = {
		schoolId: tenantContext.schoolId,
		classId: tenantContext.classId,
		sectionId: tenantContext.sectionId,
		examId: tenantContext.examId,
		examTypeId: tenantContext.examTypeId,
		academicId: tenantContext.academicId,
		studentId: tenantContext.studentId,
		userId: tenantContext.userId,
		staffId: tenantContext.staffId,
		roleId: tenantContext.roleId,
		designationId: tenantContext.designationId
	};

	const isClassTeacher = designationId === ALLOWED_DESIGNATIONS.CLASS_TEACHER;

	// Fields that Class Teachers are NOT allowed to modify
	const classTeacherBlockedFields: Set<keyof TenantContext> = new Set([
		'schoolId',
		'classId',
		'sectionId'
	]);

	// Validate all entities FIRST before applying any updates.
	// This ensures atomicity: either all mentions are valid, or none are applied.
	const resolvedEntities: ResolvedEntity[] = [];

	for (const mention of mentions) {
		// TODO(M-EDIT-04.2): file category requires requestContext for workspace-scope validation.
		if (mention.category === 'file') {
			resolvedEntities.push({ id: 0, schoolId: tenantContext.schoolId });
			continue;
		}

		// class_section: id is a {classId, sectionId} object — placeholder until M-EDIT-04.2 wires
		// a real class/section ownership lookup against the schoolId.
		if (isClassSectionId(mention.id)) {
			resolvedEntities.push({
				id: 0,
				schoolId: tenantContext.schoolId,
				classId: mention.id.classId,
				sectionId: mention.id.sectionId
			});
			continue;
		}

		if (typeof mention.id !== 'number') continue;

		const entity = await resolveEntity(mention.category, mention.id);

		// Validate entity belongs to user's school
		if (entity.schoolId !== tenantContext.schoolId) {
			throw new WorkspaceMismatchError(
				`Entity "${mention.name}" (${mention.category}:${mention.id}) does not belong to current school (schoolId: ${tenantContext.schoolId})`
			);
		}

		// For Class Teachers: validate student is in their assigned class/section
		if (isClassTeacher && mention.category === 'students') {
			const studentClassId = entity.classId ?? null;
			const studentSectionId = entity.sectionId ?? null;

			if (
				studentClassId !== tenantContext.classId ||
				studentSectionId !== tenantContext.sectionId
			) {
				throw new WorkspaceMismatchError(
					`Student "${mention.name}" is not enrolled in your assigned class/section`
				);
			}
		}

		resolvedEntities.push(entity);
	}

	// All validations passed — now apply updates left-to-right
	for (let i = 0; i < mentions.length; i++) {
		const mention = mentions[i];

		// TODO(M-EDIT-04.2): file category plumbing routes via requestContext.set('fileRef', mention).
		if (mention.category === 'file') continue;

		const field = MENTION_FIELD_MAP[mention.category];
		if (!field || field === 'fileRef') continue;

		// class_section sets BOTH classId and sectionId from the id object.
		// Handle BEFORE the generic Class-Teacher field-block check so the
		// explicit WorkspaceMismatchError below can fire (otherwise the
		// classTeacherBlockedFields branch above silently no-ops and the
		// teacher stays at their assigned class without any error).
		if (mention.category === 'class_section') {
			if (!isClassSectionId(mention.id)) continue;
			// Class Teachers are locked to their assigned class/section. Refuse
			// any mention that would change either field.
			if (isClassTeacher) {
				throw new WorkspaceMismatchError(
					`Class Teachers cannot switch class/section via @class. Mention targeted (${mention.id.classId}/${mention.id.sectionId}) but you are assigned to (${tenantContext.classId}/${tenantContext.sectionId}).`
				);
			}
			updatedFields.classId = mention.id.classId;
			updatedFields.sectionId = mention.id.sectionId;
			continue;
		}

		// exam routes to examTypeId (the generic field assignment below would also handle this
		// via MENTION_FIELD_MAP, but the explicit branch mirrors class_section and documents intent).
		if (mention.category === 'exam') {
			if (typeof mention.id !== 'number') continue;
			updatedFields.examTypeId = mention.id as number;
			continue;
		}

		if (typeof mention.id !== 'number') continue;

		// Apply the mention: override the corresponding context field
		updatedFields[field] = mention.id;
	}

	// Check if class changed (only relevant for non-Class Teachers)
	const classChanged = updatedFields.classId !== tenantContext.classId;

	// Bust cache and re-hydrate if class changed
	if (classChanged) {
		cache.bustCache(sessionId);
	}

	// TODO(M-EDIT-04.5 or follow-up): plumb `requestContext` through processMentions so the
	// `file` category can set fileRef on requestContext (rather than being skipped here).
	// The current signature intentionally omits requestContext to avoid breaking callers;
	// file mentions remain a no-op until the signature is extended.
	// Create new immutable TenantContext
	return createTenantContext({
		schoolId: updatedFields.schoolId as number,
		classId: updatedFields.classId as number | null,
		sectionId: updatedFields.sectionId as number | null,
		examId: updatedFields.examId as number | null,
		examTypeId: updatedFields.examTypeId as number | null,
		academicId: updatedFields.academicId as number | null,
		studentId: updatedFields.studentId as number | null,
		userId: updatedFields.userId as number,
		staffId: updatedFields.staffId as number,
		roleId: updatedFields.roleId as number | null,
		designationId: updatedFields.designationId as number
	});
}
