import { LocalFilesystem } from "@mastra/core/workspace";
import type { RequestContext } from "@mastra/core/request-context";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import { verifyTeacherAssignment } from "./verify-teacher";
import { classDir } from "./paths";
import { MissingTenantScopeError } from "./scope";

const verificationCache = new WeakMap<RequestContext, Promise<void>>();

function cacheVerification(requestContext: RequestContext, tenant: TenantContext): Promise<void> {
  const cached = verificationCache.get(requestContext);
  if (cached) return cached;
  const next = verifyTeacherAssignment(tenant).catch((err) => {
    verificationCache.delete(requestContext);
    throw err;
  });
  verificationCache.set(requestContext, next);
  return next;
}

function requireTenantScope(tenant: TenantContext | undefined): asserts tenant is TenantContext {
  if (!tenant) {
    throw new MissingTenantScopeError('Pick a class and section to continue.', []);
  }
  const missing: Array<'classId' | 'sectionId' | 'academicId'> = [];
  if (tenant.classId === null) missing.push('classId');
  if (tenant.sectionId === null) missing.push('sectionId');
  if (tenant.academicId === null) missing.push('academicId');
  if (missing.length > 0) {
    throw new MissingTenantScopeError('Pick a class and section to continue.', missing);
  }
}

/**
 * Resolves the per-request `LocalFilesystem` for a tenant.
 *
 * Tenant isolation is enforced by:
 *   1. Reading the active `tenantContext` from the request context.
 *   2. Requiring `classId`, `sectionId`, and `academicId` to be present.
 *      A missing scope throws `MissingTenantScopeError` — there is no
 *      `_system/` fallback. Callers MUST handle this error and surface
 *      a "pick a class" prompt to the user (HTTP 422 envelope, or a
 *      `data-notification` stream part for tools).
 *   3. Verifying that the staff member is actively assigned to the target
 *      `(classId, sectionId, academicId)` tuple (cached per request).
 *   4. Returning a `LocalFilesystem` rooted at the canonical workspace
 *      directory with `contained: true` so paths cannot escape the sandbox.
 */
export async function resolveTenantFilesystem({
  requestContext
}: {
  requestContext: RequestContext;
}): Promise<LocalFilesystem> {
  const tenant = requestContext.get("tenantContext") as TenantContext | undefined;
  requireTenantScope(tenant);

  await cacheVerification(requestContext, tenant);

  return new LocalFilesystem({ id: "tenant-fs", basePath: classDir(tenant), contained: true });
}
