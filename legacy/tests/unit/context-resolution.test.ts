/**
 * Context resolution bridge — `buildRequestContext` and `buildMastraToolContext`.
 *
 * These two functions form the seam between Mastra's `RequestContext` (which
 * carries a `Map`-like key/value store) and the typed `MastraToolContext`
 * every tool receives in its `execute()` callback.
 *
 * Tests verify:
 *   - `buildRequestContext` populates every field the chatWorkflow reads.
 *   - `buildMastraToolContext(undefined)` returns the locked default with
 *     stub `getRepo`/`getService` that throw on call (no silent fallback).
 *   - `buildMastraToolContext(realRequestContext)` returns the tenant-bound
 *     provider.
 *   - `validateWorkspaceLock` rejects mismatched classId/sectionId.
 *   - `validateRoleWhitelist` rejects forbidden designationId.
 */
import { describe, it, expect } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import {
	buildMastraToolContext,
	validateWorkspaceLock,
	validateRoleWhitelist,
	WorkspaceMismatchError,
	ForbiddenError,
	createTenantContext
} from '$lib/server/mastra/tenant-context';
import { buildRequestContext } from '$lib/server/helpers/chat-helper';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { RequestContextValues } from '$lib/server/mastra/agents';

describe('buildRequestContext', () => {
	it('populates tenantContext, isSlashCommand, lastMessage from inputs', async () => {
		const ctx: TenantContext = createTenantContext({ schoolId: 3, classId: 4 });
		const rc = await buildRequestContext({
			context: ctx,
			userId: 42,
			modelId: '',
			isSlashCommand: true,
			lastMessage: '/context'
		});
		expect(rc.get('tenantContext')).toBe(ctx);
		expect(rc.get('isSlashCommand')).toBe(true);
		expect(rc.get('lastMessage')).toBe('/context');
	});


});

describe('buildMastraToolContext', () => {
	it('returns a locked default when requestContext is undefined', async () => {
		const toolCtx = await buildMastraToolContext(undefined);
		expect(toolCtx.tenantContext.schoolId).toBe(1);
		expect(() => toolCtx.getRepo({} as never)).toThrow();
		expect(() => toolCtx.getService({} as never)).toThrow();
	});

	it('returns the tenant-bound provider when requestContext is provided', async () => {
		const ctx: TenantContext = createTenantContext({ schoolId: 7 });
		const rc = new RequestContext<RequestContextValues>();
		rc.set('tenantContext', ctx);
		const toolCtx = await buildMastraToolContext(rc);
		expect(toolCtx.tenantContext).toBe(ctx);
		expect(typeof toolCtx.getRepo).toBe('function');
	});
});

describe('validateWorkspaceLock', () => {
	const teacherCtx: TenantContext = createTenantContext({
		schoolId: 1,
		classId: 5,
		sectionId: 9,
		designationId: ALLOWED_DESIGNATIONS.CLASS_TEACHER
	});

	it('passes when target classId matches the active context', () => {
		expect(() => validateWorkspaceLock(teacherCtx, 5)).not.toThrow();
	});

	it('throws WorkspaceMismatchError when target classId differs', () => {
		expect(() => validateWorkspaceLock(teacherCtx, 6)).toThrow(WorkspaceMismatchError);
	});

	it('throws when target sectionId differs', () => {
		expect(() => validateWorkspaceLock(teacherCtx, 5, 9)).not.toThrow();
		expect(() => validateWorkspaceLock(teacherCtx, 5, 10)).toThrow(WorkspaceMismatchError);
	});

	it('passes when target classId is null (no lock)', () => {
		const openCtx = createTenantContext({ schoolId: 1, classId: null });
		expect(() => validateWorkspaceLock(openCtx, 99)).not.toThrow();
	});
});

describe('validateRoleWhitelist', () => {
	it('passes when the designation is in the allowlist', () => {
		const ctx: TenantContext = createTenantContext({
			designationId: ALLOWED_DESIGNATIONS.IT
		});
		expect(() => validateRoleWhitelist(ctx, [ALLOWED_DESIGNATIONS.IT])).not.toThrow();
	});

	it('throws ForbiddenError when the designation is not in the allowlist', () => {
		const ctx: TenantContext = createTenantContext({
			designationId: 999
		});
		expect(() => validateRoleWhitelist(ctx, [ALLOWED_DESIGNATIONS.IT])).toThrow(ForbiddenError);
	});
});
