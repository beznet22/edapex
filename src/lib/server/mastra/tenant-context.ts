import type { ScopedRepositoryProvider } from "./scoped-repository";

/**
 * Immutable tenant context bound per-request.
 * Freezing prevents mutation after hydration in hooks.server.ts.
 */
export interface TenantContext {
  readonly schoolId: number;
  readonly userId: number;
  readonly designationId: number;
  readonly staffId: number;
  readonly roleId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly examId: number | null;
  readonly academicId: number | null;
  readonly studentId: number | null;
}

export function createTenantContext(params: Partial<{
  schoolId: number;
  classId: number | null;
  sectionId: number | null;
  examId: number | null;
  academicId: number | null;
  studentId: number | null;
  userId: number;
  staffId: number;
  roleId: number | null;
  designationId: number;
}>): TenantContext {
  return Object.freeze({
    schoolId: params.schoolId ?? 1,
    classId: params.classId ?? null,
    sectionId: params.sectionId ?? null,
    examId: params.examId ?? null,
    academicId: params.academicId ?? null,
    studentId: params.studentId ?? null,
    userId: params.userId ?? 1,
    staffId: params.staffId ?? 1,
    roleId: params.roleId ?? null,
    designationId: params.designationId ?? 1,
  });
}

export class WorkspaceMismatchError extends Error {
  constructor(message: string = "WORKSPACE_MISMATCH") {
    super(message);
    this.name = "WorkspaceMismatchError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Validates that the target classId and sectionId match the current tenant context.
 * Useful for ensuring Class Teachers cannot access data outside their assigned sandbox.
 */
export function validateWorkspaceLock(
  context: TenantContext,
  targetClassId: number | null,
  targetSectionId?: number | null,
): void {
  if (context.classId !== null && targetClassId !== null) {
    if (context.classId !== targetClassId) {
      throw new WorkspaceMismatchError();
    }
  }

  if (context.sectionId !== null && targetSectionId !== undefined && targetSectionId !== null) {
    if (context.sectionId !== targetSectionId) {
      throw new WorkspaceMismatchError();
    }
  }
}

/**
 * Validates that the current user has one of the allowed roles.
 */
export function validateRoleWhitelist(context: TenantContext, allowedRoles: number[]): void {
  if (!allowedRoles.includes(context.designationId)) {
    throw new ForbiddenError();
  }
}

/**
 * Context injected into every Mastra tool execute() call.
 * Provides tenant-scoped repositories and audit metadata.
 */
export interface MastraToolContext {
  tenantContext: TenantContext;
  getRepo: <T>(RepoClass: { name?: string; new (...args: any[]): T }) => T;
  audit?: { threadId?: string; modelId?: string };
}
