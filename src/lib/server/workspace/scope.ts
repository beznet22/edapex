/**
 * Workspace scope guard — EdApex
 *
 * Validates that a file path is within the active tenant's workspace root
 * before allowing read/write operations. Prevents cross-tenant file access.
 *
 * Workspace root format:
 *   .workspaces/<schoolId>/<classId>_<sectionId>_AY<academicId>/
 *
 * Example: .workspaces/1/12_6_AY4/ for school 1, class 12, section 6, AY 4.
 */
import type { TenantContext } from '$lib/server/mastra/tenant-context';

export class WorkspaceScopeError extends Error {
  constructor(message: string = 'WORKSPACE_SCOPE_VIOLATION') {
    super(message);
    this.name = 'WorkspaceScopeError';
  }
}

export function buildWorkspaceRoot(tenant: TenantContext): string {
  if (tenant.classId === null || tenant.sectionId === null || tenant.academicId === null) {
    throw new WorkspaceScopeError(
      `Cannot build workspace root: missing classId (${tenant.classId}), sectionId (${tenant.sectionId}), or academicId (${tenant.academicId})`,
    );
  }
  return `.workspaces/${tenant.schoolId}/${tenant.classId}_${tenant.sectionId}_AY${tenant.academicId}`;
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
