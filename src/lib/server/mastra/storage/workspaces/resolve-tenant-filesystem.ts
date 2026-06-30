import { LocalFilesystem } from "@mastra/core/workspace";
import type { RequestContext } from "@mastra/core/request-context";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import { verifyTeacherAssignment } from "./verify-teacher-assignment";
import { classDir, SYSTEM_WORKSPACE } from "./paths";

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

/**
 * Resolves the per-request `LocalFilesystem` for a tenant.
 *
 * Tenant isolation is enforced by:
 *   1. Reading the active `tenantContext` from the request context
 *   2. Verifying that the staff member is actively assigned to the target
 *      `(classId, sectionId, academicId)` tuple (cached per request)
 *   3. Returning a `LocalFilesystem` rooted at the canonical workspace
 *      directory with `contained: true` so paths cannot escape the sandbox
 *
 * Fallback cases:
 *   - No tenant context (system call) -> `_system/` workspace
 *   - Missing class/section context (admin) -> `_system/` workspace + warning
 */
export async function resolveTenantFilesystem({
  requestContext
}: {
  requestContext: RequestContext;
}): Promise<LocalFilesystem> {
  const tenant = requestContext.get("tenantContext") as TenantContext | undefined;

  if (!tenant || tenant.classId === null || tenant.sectionId === null) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[resolveTenantFilesystem] tenant lacks classId/sectionId; falling back to _system/. ` +
          `This usually indicates a missing class-selector cookie or admin operating without an active class.`
      );
    }
    return new LocalFilesystem({ id: "tenant-fs", basePath: SYSTEM_WORKSPACE, contained: true });
  }

  await cacheVerification(requestContext, tenant);

  return new LocalFilesystem({ id: "tenant-fs", basePath: classDir(tenant), contained: true });
}
