/**
 * Workspace scope guard — verifies `assertPathAgentVisible` correctly
 * re-roots paths into the active tenant's classDir and rejects
 * path-traversal / cross-school escape attempts.
 */
import { describe, it, expect } from 'vitest';
import { assertPathAgentVisible, WorkspaceScopeError } from '$lib/server/workspace/scope';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import path from 'node:path';
import { WORKSPACE_ROOT, classDir } from '$lib/server/workspace/paths';

const tenant = createTenantContext({
	schoolId: 1,
	classId: 18,
	sectionId: 6,
	academicId: 5,
	className: 'LOWER BASIC 2',
	sectionName: 'B',
	academicYearTitle: '2024-2025'
});

const root = classDir(tenant);

describe('assertPathAgentVisible', () => {
	it('rejects absolute paths even if they happen to be under the class dir', () => {
		// The function is strict: callers must pass relative paths.
		// Absolute paths are always rejected (even valid ones) so the
		// agent cannot reach outside the workspace by accident.
		const input = `${root}/ocr/foo.md`;
		expect(() => assertPathAgentVisible(tenant, input)).toThrow(WorkspaceScopeError);
	});

	it('re-roots a bare relative path under the class dir', () => {
		const out = assertPathAgentVisible(tenant, 'ocr/foo.md');
		expect(out).toBe(`${root}/ocr/foo.md`);
	});

	it('re-roots a .workspaces/<schoolId>/<rest> path, stripping the schoolId segment', () => {
		// The function strips `.workspaces/<schoolId>/` and re-roots the
		// remaining tail under the active class dir. Inner segments like
		// `AY5-2024-2025/18-lb2_6-b/` are passed through so a stale path
		// that already encodes the active class still resolves to a real
		// file on disk (the filesystem layer joins with classDir again).
		const out = assertPathAgentVisible(
			tenant,
			'.workspaces/1/AY5-2024-2025/18-lb2_6-b/exams/examType-1/marksheets/123.md'
		);
		expect(out).toBe(
			`${root}/AY5-2024-2025/18-lb2_6-b/exams/examType-1/marksheets/123.md`
		);
	});

	it('rejects absolute paths that are NOT under the class dir', () => {
		expect(() => assertPathAgentVisible(tenant, '/etc/passwd')).toThrow(WorkspaceScopeError);
	});

	it('rejects paths containing ".."', () => {
		expect(() => assertPathAgentVisible(tenant, 'foo/../../bar')).toThrow(WorkspaceScopeError);
	});

	it('rejects cross-school paths', () => {
		const otherSchoolPath = path.join(WORKSPACE_ROOT, '2', 'AY5-2024-2025', '18-lb2_6-b', 'ocr/foo.md');
		expect(() => assertPathAgentVisible(tenant, otherSchoolPath)).toThrow(WorkspaceScopeError);
	});
});
