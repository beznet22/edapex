/**
 * Shared helper for HTTP route handlers that resolve a tenant filesystem.
 *
 * `resolveTenantFilesystem` throws `MissingTenantScopeError` when the
 * active tenant context lacks `classId`, `sectionId`, or `academicId`.
 * There is no `_system/` fallback. Every route that calls a resolver
 * MUST wrap the call in `withMissingTenantScopeCatch` (or branch on
 * `isMissingTenantScopeError`) and return the canonical 422 envelope.
 *
 * Keeping this in one file ensures the wire shape stays consistent and
 * the "pick a class" copy is updated in lockstep across endpoints.
 */
import { json } from '@sveltejs/kit';
import { MissingTenantScopeError } from '$lib/server/workspace';

export const TENANT_SCOPE_MESSAGE = 'Pick a class and section to continue.';
export const TENANT_SCOPE_ERROR_CODE = 'TENANT_SCOPE_REQUIRED';

export function isMissingTenantScopeError(err: unknown): err is MissingTenantScopeError {
  return err instanceof MissingTenantScopeError;
}

/**
 * Canonical JSON envelope for a missing-tenant-scope condition.
 * HTTP 422 — the request is well-formed but lacks required business
 * context, which is exactly what an active class/section tuple is.
 */
export function tenantScopeResponse(): Response {
  return json(
    { error: TENANT_SCOPE_ERROR_CODE, message: TENANT_SCOPE_MESSAGE },
    { status: 422 }
  );
}

/**
 * Run `fn`. If it throws `MissingTenantScopeError`, return the canonical
 * 422 response. Re-throws everything else unchanged so existing handlers
 * keep their error semantics for non-scope failures.
 *
 * Overloads:
 *   - `fn` returns a `Response` (typical for HTTP routes): return the
 *     canonical 422 directly.
 *   - `fn` returns a domain object (typical for `resolveTenantWorkspace`):
 *     return a discriminated union `{ ok: false, response: Response } |
 *     { ok: true, value: T }` so callers can short-circuit before
 *     destructuring.
 */
export async function withMissingTenantScopeCatch<T>(fn: () => Promise<T>): Promise<T | Response>;
export async function withMissingTenantScopeCatch<T>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    if (isMissingTenantScopeError(err)) {
      return tenantScopeResponse();
    }
    throw err;
  }
}
