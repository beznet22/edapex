import type { TenantContext } from './tenant-context';

/**
 * Workspace manifest — the resolved class/section assignment for a staff member.
 * Null indicates the user has no workspace assigned (redirect to /pending-assignment).
 */
export interface WorkspaceManifest {
	classId: number;
	sectionId: number;
	className: string;
	sectionName: string;
}

export interface RouteGuardResult {
	status: 'ok' | 'redirect';
	redirectTo?: string;
	tenant?: TenantContext;
	workspace?: WorkspaceManifest;
}

/**
 * Evaluates whether a request should proceed or redirect.
 *
 * Per ui_spec.md §User Avatar Dropdown:
 * "If the user has no active workspace assignment, the badge renders
 * a distinct 'Unassigned ⚠' warning state and all slash commands
 * are disabled until an administrator assigns a workspace."
 *
 * Per implementation_checklist.md §1.2:
 * "Verify hooks.server.ts redirects to /pending-assignment
 * if context hydration yields a null workspaceManifest."
 */
export function evaluateRouteGuard(
	tenant: TenantContext | null,
	workspace: WorkspaceManifest | null,
	pathname: string
): RouteGuardResult {
	// Public routes that don't require workspace assignment
	const publicPaths = ['/login', '/pending-assignment', '/api/auth', '/health'];
	if (publicPaths.some((p) => pathname.startsWith(p))) {
		return { status: 'ok' };
	}

	// No tenant context = not authenticated
	if (!tenant) {
		return { status: 'redirect', redirectTo: '/login' };
	}

	// Tenant exists but no workspace assignment
	if (!workspace) {
		return { status: 'redirect', redirectTo: '/pending-assignment' };
	}

	return {
		status: 'ok',
		tenant,
		workspace
	};
}
