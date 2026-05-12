/**
 * Immutable tenant context bound per-request.
 * Freezing prevents mutation after hydration in hooks.server.ts.
 */
export interface TenantContext {
	readonly schoolId: number;
	readonly classId: number | null;
	readonly sectionId: number | null;
	readonly examId: number | null;
	readonly academicId: number | null;
	readonly userId: number;
	readonly designationId: number;
}

export function createTenantContext(params: {
	schoolId: number;
	classId?: number | null;
	sectionId?: number | null;
	examId?: number | null;
	academicId?: number | null;
	userId: number;
	designationId: number;
}): TenantContext {
	return Object.freeze({
		schoolId: params.schoolId,
		classId: params.classId ?? null,
		sectionId: params.sectionId ?? null,
		examId: params.examId ?? null,
		academicId: params.academicId ?? null,
		userId: params.userId,
		designationId: params.designationId
	});
}
