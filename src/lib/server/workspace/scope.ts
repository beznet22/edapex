/**
 * Workspace scope guard & central tenant workspace resolver — EdApex
 *
 * Central resolver for all workspace CRUD operations. Every route or tool
 * that needs to read or write files in a tenant's workspace MUST use
 * `resolveTenantWorkspace` instead of building the tenant context inline.
 *
 * This guarantees:
 *   1. The correct human-readable workspace path is produced
 *      (.workspaces/<schoolId>/AY<id>-<year-slug>/<classId>-<slug>_<sectionId>-<slug>/)
 *      instead of the ID-only fallback that created stale ghost directories.
 *   2. `className`, `sectionName`, and `academicYearTitle` are always
 *      populated via `resolveClassNamesByIds()`.
 *   3. The per-request teacher-assignment verification runs once.
 *
 * Resolver output:
 *   { tenant: TenantContext, requestContext: RequestContext, fs: LocalFilesystem }
 *
 * Workspace root format (see `classDir` in paths.ts for the canonical builder):
 *   <WORKSPACE_ROOT>/<schoolId>/AY<academicId>-<year-slug>/<classId>-<class-slug>_<sectionId>-<section-slug>/
 *
 * Example: /abs/.workspaces/1/AY4-2025/2026/12-c_5-a/ for school 1, AY 4 (year
 * "2025/2026"), class 12 (slug "c"), section 5 (slug "a").
 *
 * `buildWorkspaceRoot` delegates to `classDir` so the file API's path
 * validation matches the actual filesystem layout produced by stream-document
 * and other write paths.
 */
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import { classDir } from '$lib/server/workspace/paths';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { resolveActiveClassScope, resolveClassNamesByIds } from '$lib/server/helpers/class-scope';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';

export class WorkspaceScopeError extends Error {
  readonly code: string;
  constructor(message: string = 'WORKSPACE_SCOPE_VIOLATION', code: string = 'WORKSPACE_SCOPE_VIOLATION') {
    super(message);
    this.name = 'WorkspaceScopeError';
    this.code = code;
  }
}

/**
 * Thrown by `resolveTenantFilesystem` when the active tenant context is
 * missing the fields required to scope a workspace (`classId`,
 * `sectionId`, or `academicId`). Callers should catch this explicitly
 * and surface a "pick a class" prompt to the user — there is no
 * `_system/` fallback. Extends `WorkspaceScopeError` so existing
 * scope-error handlers continue to match.
 */
export class MissingTenantScopeError extends WorkspaceScopeError {
  constructor(
    message: string = 'Pick a class and section to continue.',
    missing: ReadonlyArray<'classId' | 'sectionId' | 'academicId'> = []
  ) {
    super(message, 'TENANT_SCOPE_REQUIRED');
    this.name = 'MissingTenantScopeError';
    this.missing = missing;
  }
  readonly missing: ReadonlyArray<'classId' | 'sectionId' | 'academicId'>;
}

/**
 * Type-narrowing predicate for `MissingTenantScopeError`. Re-exported
 * from the workspace barrel so tool/service code can branch without
 * importing the file directly.
 */
export function isMissingTenantScopeError(err: unknown): err is MissingTenantScopeError {
  return err instanceof MissingTenantScopeError;
}

export function buildWorkspaceRoot(tenant: TenantContext): string {
  if (tenant.classId === null || tenant.sectionId === null || tenant.academicId === null) {
    throw new WorkspaceScopeError(
      `Cannot build workspace root: missing classId (${tenant.classId}), sectionId (${tenant.sectionId}), or academicId (${tenant.academicId})`,
    );
  }
  return classDir(tenant);
}

/**
 * Central workspace resolver — single source of truth for ALL workspace CRUD.
 *
 * Every route/tool that needs workspace access should call this instead of
 * building the tenant context inline. Automatically resolves the active class
 * scope (cookie → query param → teacher assignment), display names for
 * human-readable path slugs, and returns a ready-to-use LocalFilesystem.
 */
export async function resolveTenantWorkspace(params: {
  schoolId: number;
  userId: number;
  staffId?: number;
  designationId?: number;
  roleId?: number | null;
  className?: string | null;
  sectionName?: string | null;
  selectedClassCookie?: string | null;
  examTypeId?: number | null;
  academicId?: number | null;
}): Promise<{
  tenant: TenantContext;
  requestContext: import('@mastra/core/request-context').RequestContext<unknown>;
  fs: import('@mastra/core/workspace').WorkspaceFilesystem;
}> {
  const scope = await resolveActiveClassScope({
    schoolId: params.schoolId,
    staffId: params.staffId,
    className: params.className,
    sectionName: params.sectionName,
    selectedClassCookie: params.selectedClassCookie,
  });

  const displayNames = scope
    ? await resolveClassNamesByIds({
        schoolId: params.schoolId,
        classId: scope.classId,
        sectionId: scope.sectionId,
        academicId: scope.academicId,
      })
    : { className: null, sectionName: null, academicYearTitle: null };

  const tenant = createTenantContext({
    schoolId: params.schoolId,
    userId: params.userId,
    staffId: params.staffId ?? 1,
    designationId: params.designationId ?? ALLOWED_DESIGNATIONS.IT,
    roleId: params.roleId ?? null,
    classId: scope?.classId ?? null,
    sectionId: scope?.sectionId ?? null,
    examId: null,
    examTypeId: params.examTypeId ?? null,
    academicId: scope?.academicId ?? null,
    className: displayNames.className,
    sectionName: displayNames.sectionName,
    academicYearTitle: displayNames.academicYearTitle,
  });

  const requestContext = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({
    requestContext: requestContext as never,
  });
  if (!fs) {
    throw new Error('WORKSPACE_FILESYSTEM_UNAVAILABLE');
  }

  return { tenant, requestContext, fs };
}

/**
 * Normalize a relative file path by stripping leading slashes.
 */
function normalizePath(path: string): string {
  return path.replace(/^\/+/, '');
}

/**
 * Assert that `path` is within the active tenant's workspace root.
 * Throws WorkspaceScopeError if not. Returns the resolved absolute workspace
 * path on success (suitable for fs operations).
 */
export function assertPathAgentVisible(
  tenant: TenantContext,
  path: string,
): string {
  const root = buildWorkspaceRoot(tenant);
  const normalized = path.replace(/^\/+/, '');

  // Reject path traversal and absolute paths in the ORIGINAL input (before normalization).
  if (path.startsWith('/') || path.includes('..')) {
    throw new WorkspaceScopeError(
      `Path "${path}" is outside the active workspace. Must start with "${root}/".`,
    );
  }

  // Path already includes the workspace root prefix: return as-is.
  const expectedPrefix = `${root}/`;
  if (normalized.startsWith(expectedPrefix)) {
    return normalized;
  }

  // Path begins with `.workspaces/<schoolId>/...`: validate the schoolId matches,
  // strip the `.workspaces/<schoolId>/` prefix, and re-root under the active tenant.
  if (normalized.startsWith('.workspaces/')) {
    const segments = normalized.slice('.workspaces/'.length).split('/');
    if (segments[0] !== String(tenant.schoolId)) {
      throw new WorkspaceScopeError(
        `Path "${path}" references school ${segments[0]} but active tenant is school ${tenant.schoolId}.`,
      );
    }
    const tail = segments.slice(1).join('/');
    return `${root}/${tail}`;
  }

  // Bare relative path: root-prefix it.
  return `${root}/${normalized}`;
}
