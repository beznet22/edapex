import path from "node:path";
import { LocalFilesystem } from "@mastra/core/workspace";
import type { RequestContext } from "@mastra/core/request-context";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import { verifyTeacherAssignment } from "./verify-teacher-assignment";

const WORKSPACE_ROOT = path.resolve(process.cwd(), ".workspaces");
const SYSTEM_WORKSPACE = path.join(WORKSPACE_ROOT, "_system");

const verificationCache = new Map<string, Promise<void>>();

function tenantKey(tenant: TenantContext): string {
  return `${tenant.schoolId}:${tenant.classId}:${tenant.sectionId}:${tenant.academicId}:${tenant.staffId}`;
}

function cacheVerification(tenant: TenantContext): Promise<void> {
  const key = tenantKey(tenant);
  const cached = verificationCache.get(key);
  if (cached) return cached;
  const next = verifyTeacherAssignment(tenant).catch((err) => {
    verificationCache.delete(key);
    throw err;
  });
  verificationCache.set(key, next);
  return next;
}

/**
 * Builds the per-tenant root path:
 *   `./workspace/[schoolId]/[classId_sectionId_AY<academicId>]/`
 *
 * When `tenant.examTypeId` is set, term-specific resources live one level
 * deeper under `exams/examType-<examTypeId>/` (year-level content like OCR
 * markdown and CLI outputs stays at the year level).
 */
function classDir(tenant: TenantContext): string {
  const yearSeg = `AY${tenant.academicId ?? 0}`;
  const classSeg = `${tenant.classId}_${tenant.sectionId}_${yearSeg}`;
  const parts = [WORKSPACE_ROOT, String(tenant.schoolId), classSeg];
  return path.join(...parts);
}

function examSubdir(tenant: TenantContext): string {
  return path.join(classDir(tenant), "exams", `exam-${tenant.examId}`);
}

function termSubdir(tenant: TenantContext): string {
  return path.join(classDir(tenant), "exams", `examType-${tenant.examTypeId}`);
}

/**
 * Resolves the per-request `LocalFilesystem` for a tenant.
 *
 * Tenant isolation is enforced by:
 *   1. Reading the active `tenantContext` from the request context
 *   2. Verifying that the staff member is actively assigned to the target
 *      `(classId, sectionId, academicId)` tuple (cached per request)
 *   3. Returning a `LocalFilesystem` rooted at the per-class directory
 *      with `contained: true` so paths cannot escape the sandbox
 *
 * Sub-paths within the tenant root:
 *   - `extracted/`, `agentic-files/`, `docs/`         ← year-level
 *   - `exams/examType-<examTypeId>/...`               ← term-specific (only
 *                                                      when examTypeId is set)
 *
 * Fallback cases:
 *   - No tenant context (system call) → `_system/` workspace
 *   - Missing class/section context (admin) → `_system/` workspace
 *
 * The resolver is invoked once per tool call by the workspace runtime.
 * The verification promise cache deduplicates DB round-trips within a request.
 */
export async function resolveTenantFilesystem({
  requestContext,
}: {
  requestContext: RequestContext;
}): Promise<LocalFilesystem> {
  const tenant = requestContext.get("tenantContext") as TenantContext | undefined;

  if (!tenant || tenant.classId === null || tenant.sectionId === null) {
    return new LocalFilesystem({ id: "tenant-fs", basePath: SYSTEM_WORKSPACE, contained: true });
  }

  await cacheVerification(tenant);

  return new LocalFilesystem({ id: "tenant-fs", basePath: classDir(tenant), contained: true });
}

/**
 * Resolves the per-request `LocalFilesystem` scoped to the active term
 * (examTypeId) within the tenant. Returns the system workspace if the
 * tenant has no active term context.
 *
 * Path: `./workspace/[schoolId]/[classId_sectionId_AY<academicId>]/exams/examType-<examTypeId>/`
 */
export async function resolveExamFilesystem({
  requestContext,
}: {
  requestContext: RequestContext;
}): Promise<LocalFilesystem> {
  const tenant = requestContext.get("tenantContext") as TenantContext | undefined;

  if (
    !tenant ||
    tenant.classId === null ||
    tenant.sectionId === null ||
    tenant.examTypeId === null
  ) {
    return new LocalFilesystem({ id: "exam-fs", basePath: SYSTEM_WORKSPACE, contained: true });
  }

  await cacheVerification(tenant);

  return new LocalFilesystem({ id: "exam-fs", basePath: termSubdir(tenant), contained: true });
}
