/**
 * TenantContext shape — every field is readonly, every field defaults safely,
 * and the frozen object cannot be mutated at runtime.
 */
import { describe, it, expect } from 'vitest';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import type { TenantContext } from '$lib/server/mastra/tenant-context';

describe('TenantContext', () => {
	it('createTenantContext({}) returns sensible defaults', () => {
		const ctx = createTenantContext({});
		expect(ctx.schoolId).toBe(1);
		expect(ctx.userId).toBe(1);
		expect(ctx.staffId).toBe(1);
		expect(ctx.classId).toBeNull();
		expect(ctx.sectionId).toBeNull();
		expect(ctx.examId).toBeNull();
		expect(ctx.examTypeId).toBeNull();
		expect(ctx.academicId).toBeNull();
		expect(ctx.studentId).toBeNull();
		expect(ctx.roleId).toBeNull();
		expect(ctx.designationId).toBe(ALLOWED_DESIGNATIONS.IT);
	});

	it('createTenantContext honours explicit overrides', () => {
		const ctx = createTenantContext({
			schoolId: 7,
			userId: 42,
			staffId: 99,
			classId: 12,
			sectionId: 34,
			examId: 5,
			examTypeId: 6,
			academicId: 4,
			studentId: 1000,
			designationId: ALLOWED_DESIGNATIONS.CLASS_TEACHER
		});
		expect(ctx).toMatchObject({
			schoolId: 7,
			userId: 42,
			staffId: 99,
			classId: 12,
			sectionId: 34,
			examId: 5,
			examTypeId: 6,
			academicId: 4,
			studentId: 1000,
			designationId: ALLOWED_DESIGNATIONS.CLASS_TEACHER
		});
	});

	it('the returned object is frozen (immutable at runtime)', () => {
		const ctx: TenantContext = createTenantContext({ schoolId: 5 });
		expect(Object.isFrozen(ctx)).toBe(true);
		// Strict-mode mutation throws; non-strict silently no-ops. Either way,
		// the field must remain unchanged.
		const originalSchool = ctx.schoolId;
		try {
			(ctx as { schoolId: number }).schoolId = 999;
		} catch {
			// expected in strict mode
		}
		expect(ctx.schoolId).toBe(originalSchool);
	});
});
