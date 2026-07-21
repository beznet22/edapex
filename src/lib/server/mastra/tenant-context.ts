import { desc, eq } from "drizzle-orm";
import type { RequestContext } from "@mastra/core/request-context";
import { ScopedRepositoryProvider } from "./scoped-repository";
import { getDatabase } from "$lib/server/db";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { smExamTypes } from "$lib/server/db/sms-schema";

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
  readonly examTypeId: number | null;
  readonly academicId: number | null;
  readonly studentId: number | null;
  // Display fields (used by paths.ts for human-readable workspace paths).
  // Populated at TenantContext construction time so slug generation never
  // needs a DB round-trip.
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly academicYearTitle: string | null;
}

export function createTenantContext(params: Partial<{
  schoolId: number;
  classId: number | null;
  sectionId: number | null;
  examId: number | null;
  examTypeId: number | null;
  academicId: number | null;
  studentId: number | null;
  userId: number;
  staffId: number;
  roleId: number | null;
  designationId: number;
  className: string | null;
  sectionName: string | null;
  academicYearTitle: string | null;
}>): TenantContext {
  return Object.freeze({
    schoolId: params.schoolId ?? 1,
    classId: params.classId ?? null,
    sectionId: params.sectionId ?? null,
    examId: params.examId ?? null,
    examTypeId: params.examTypeId ?? null,
    academicId: params.academicId ?? null,
    studentId: params.studentId ?? null,
    userId: params.userId ?? 1,
    staffId: params.staffId ?? 1,
    roleId: params.roleId ?? null,
    designationId: params.designationId ?? ALLOWED_DESIGNATIONS.IT,
    className: params.className ?? null,
    sectionName: params.sectionName ?? null,
    academicYearTitle: params.academicYearTitle ?? null,
  });
}

export async function resolveExamTypeId(
  schoolId: number,
  examTypeId: number | null,
): Promise<number | null> {
  if (examTypeId !== null) return examTypeId;
  const db = await getDatabase();
  const [latest] = await db
    .select({ id: smExamTypes.id })
    .from(smExamTypes)
    .where(eq(smExamTypes.schoolId, schoolId))
    .orderBy(desc(smExamTypes.id))
    .limit(1);
  return latest?.id ?? null;
}

export function withExamTypeId(
  tenant: TenantContext,
  examTypeId: number | null,
): TenantContext {
  return Object.freeze({ ...tenant, examTypeId });
}

export function withAcademicId(
  tenant: TenantContext,
  academicId: number | null,
): TenantContext {
  return Object.freeze({ ...tenant, academicId });
}

const DEFAULT_TENANT: TenantContext = createTenantContext({});

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
export type RepositoryClass<T> = { name?: string; new(...args: any[]): T };
export type ServiceClass<T> = { new(provider: ScopedRepositoryProvider): T };

export interface MastraToolContext {
  tenantContext: TenantContext;
  getRepo: <T>(RepoClass: RepositoryClass<T>) => T;
  getService: <T>(ServiceClass: ServiceClass<T>) => T;
  getProvider?: () => ScopedRepositoryProvider;
  audit?: { threadId?: string; modelId?: string };
  mastra?: unknown;
}

/**
 * Single bridge between Mastra's `ToolExecutionContext` (which carries a
 * `RequestContext`) and the `MastraToolContext` shape that every `*Logic`
 * function in `src/lib/server/mastra/tools/*` consumes.
 *
 * Behavior:
 * - If `requestContext` is `undefined`, returns a locked default whose
 *   `getRepo`/`getService` throw on call. This lets unit tests hand-build a
 *   `MastraToolContext` directly (see `__tests__/slash-commands.test.ts`'s
 *   `makeToolContext`) and still type-check against the same interface.
 * - Otherwise reads `tenantContext`, `threadId`, and `modelId` from the
 *   request context, awaits the singleton Drizzle client via `getDatabase()`,
 *   and constructs a `ScopedRepositoryProvider` bound to that tenant + db.
 *
 * The provider is created per-call, so each tool invocation gets a fresh
 * cache. This is the boundary that turns Mastra's request-scoped
 * `RequestContext` into a per-request tenant-bound repository factory.
 *
 * See `docs/slash_command_tool_hardening_plan.md` §2.2 (B2 fix) and §4
 * Slice 0.
 */
export async function buildMastraToolContext<T = unknown>(
  requestContext: RequestContext<T> | undefined,
  mastra?: unknown,
): Promise<MastraToolContext> {
  if (!requestContext) {
    return {
      tenantContext: DEFAULT_TENANT,
      getRepo: (() => {
        throw new Error(
          "MastraToolContext.getRepo() called without a request context. " +
          "Use buildMastraToolContext(context.requestContext) at the tool " +
          "bridge, or hand-build a MastraToolContext in tests.",
        );
      }) as MastraToolContext["getRepo"],
      getService: (() => {
        throw new Error(
          "MastraToolContext.getService() called without a request context. " +
          "Use buildMastraToolContext(context.requestContext) at the tool " +
          "bridge, or hand-build a MastraToolContext in tests.",
        );
      }) as MastraToolContext["getService"],
      audit: {},
      mastra: undefined,
    };
  }

  const rc = requestContext as RequestContext<Record<string, any>>;
  const tenant = (rc.get("tenantContext") as TenantContext | undefined) ?? DEFAULT_TENANT;
  const threadId = rc.get("threadId") as string | undefined;
  const modelId = rc.get("modelId") as string | undefined;

  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(db, tenant);

  const getRepo: MastraToolContext["getRepo"] = (RepoClass) =>
    provider.getRepo(RepoClass as never);
  const getService: MastraToolContext["getService"] = (ServiceClass) =>
    provider.getService(ServiceClass as never);

  return {
    tenantContext: tenant,
    getRepo,
    getService,
    getProvider: () => provider,
    audit: { threadId, modelId },
    mastra,
  };
}
