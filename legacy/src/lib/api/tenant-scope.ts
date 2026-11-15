/**
 * Client-side helper for the tenant-scope error envelope.
 *
 * The server returns `{ error: 'TENANT_SCOPE_REQUIRED', message: '...' }`
 * with HTTP 422 when the active request has no class/section. This helper
 * extracts the message (or falls back to the canonical copy) so callers
 * can call `toast.error(...)` consistently. Use `parseTenantScopeError`
 * inside any fetch catch block that wants to surface a "pick a class"
 * toast instead of a generic upload error.
 */
import { TENANT_SCOPE_ERROR_CODE, TENANT_SCOPE_MESSAGE } from '$lib/server/helpers/tenant-scope-error';

export interface TenantScopeBody {
  error?: string;
  message?: string;
}

export function isTenantScopeResponse(status: number, body: unknown): boolean {
  if (status !== 422) return false;
  if (!body || typeof body !== 'object') return false;
  const err = (body as TenantScopeBody).error;
  return err === TENANT_SCOPE_ERROR_CODE;
}

export function parseTenantScopeError(body: unknown): string {
  if (body && typeof body === 'object') {
    const msg = (body as TenantScopeBody).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return TENANT_SCOPE_MESSAGE;
}
