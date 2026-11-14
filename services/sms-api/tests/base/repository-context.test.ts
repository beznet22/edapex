import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createEmptyConfigCache,
  createRepositoryContext,
  createUnscopedContext
} from "../../src/lib/server/repository/base/repository-context";
import type { TenantContext } from "../../src/lib/server/repository/base/repository-context";
import { database, seedSchool, tenantOf } from "../support/seed";

const db = database(env);

const tenant: TenantContext = {
  schoolId: 7,
  userId: 11,
  staffId: 12,
  designationId: 13,
  roleId: 14,
  academicId: 15,
  classId: null,
  sectionId: null
};

describe("RepositoryContext", () => {
  it("freezes the context and the tenant so neither can be mutated after hydration", () => {
    const ctx = createRepositoryContext(db, tenant);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.tenant)).toBe(true);
  });

  it("has no fallback tenant: schoolId is required", () => {
    expect(() =>
      createRepositoryContext(db, { ...tenant, schoolId: Number.NaN })
    ).toThrow();
    expect(() => createRepositoryContext(db, { ...tenant, schoolId: 0 })).toThrow();
  });

  it("rejects a malformed optional tenant id", () => {
    expect(() => createRepositoryContext(db, { ...tenant, classId: -1 })).toThrow();
  });

  it("builds the explicitly unscoped context with a null tenant", () => {
    const ctx = createUnscopedContext(env);
    expect(ctx.tenant).toBeNull();
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it("carries a request-scoped configuration cache", async () => {
    const school = await seedSchool(db, 1);
    const cache = createEmptyConfigCache();
    const ctx = createRepositoryContext(db, tenantOf(school), cache);
    expect(ctx.config).toBe(cache);
    expect(ctx.config.loadedAt).toBeNull();
  });
});
