import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "../../db/schema";
import type { smAcademicYears, smGeneralSettings } from "../../db/schema";
import { DbInternalError } from "./errors";

export type RepositoryDb = DrizzleD1Database<typeof schema>;

export type AcademicYearRow = typeof smAcademicYears.$inferSelect;
export type GeneralSettingRow = typeof smGeneralSettings.$inferSelect;

/**
 * Resolved once per authenticated request (`01 §6.1`) and frozen. There is no
 * fallback tenant: a missing school is a programming error, not a school 1.
 */
export interface TenantContext {
  readonly schoolId: number;
  readonly userId: number | null;
  readonly staffId: number | null;
  readonly designationId: number | null;
  readonly roleId: number | null;
  readonly academicId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
}

/**
 * Request-scoped configuration cache (`01 §5`, `01a O7`). Only
 * `school/academic-config.ts` reads or writes it; the service context owns its
 * lifetime in Phase 3.
 */
export interface ConfigCache {
  generalSettings: readonly GeneralSettingRow[] | null;
  academicYears: readonly AcademicYearRow[] | null;
  activeAcademicYear: AcademicYearRow | null;
  loadedAt: number | null;
}

export const createEmptyConfigCache = (): ConfigCache => ({
  generalSettings: null,
  academicYears: null,
  activeAcademicYear: null,
  loadedAt: null
});

export interface ScopedRepositoryContext {
  readonly db: RepositoryDb;
  readonly tenant: TenantContext;
  readonly config: ConfigCache;
}

/** The pre-tenant path (`01 §6.3`): login, claim, code redemption, linking. */
export interface UnscopedRepositoryContext {
  readonly db: RepositoryDb;
  readonly tenant: null;
  readonly config: ConfigCache;
}

export type RepositoryContext = ScopedRepositoryContext | UnscopedRepositoryContext;

const assertOptionalId = (value: number | null, field: string): void => {
  if (value === null) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new DbInternalError(`Tenant field '${field}' must be a non-negative integer`);
  }
};

const assertTenantContext = (tenant: TenantContext): void => {
  if (!Number.isInteger(tenant.schoolId) || tenant.schoolId < 1) {
    throw new DbInternalError("Tenant field 'schoolId' is required and must be a positive integer");
  }
  assertOptionalId(tenant.userId, "userId");
  assertOptionalId(tenant.staffId, "staffId");
  assertOptionalId(tenant.designationId, "designationId");
  assertOptionalId(tenant.roleId, "roleId");
  assertOptionalId(tenant.academicId, "academicId");
  assertOptionalId(tenant.classId, "classId");
  assertOptionalId(tenant.sectionId, "sectionId");
};

/** Builds the frozen, tenant-bound context for an authenticated request. */
export function createRepositoryContext(
  db: RepositoryDb,
  tenant: TenantContext,
  config: ConfigCache = createEmptyConfigCache()
): ScopedRepositoryContext {
  assertTenantContext(tenant);
  return Object.freeze({
    db,
    tenant: Object.freeze({ ...tenant }),
    config
  });
}

/**
 * Builds the explicitly unscoped context used before a tenant exists. Only
 * `accounts/` may consume it; every other repository requires a scoped tenant.
 */
export function createUnscopedContext(
  env: { readonly DB: D1Database },
  config: ConfigCache = createEmptyConfigCache()
): UnscopedRepositoryContext {
  return Object.freeze({
    db: drizzle(env.DB, { schema }),
    tenant: null,
    config
  });
}
