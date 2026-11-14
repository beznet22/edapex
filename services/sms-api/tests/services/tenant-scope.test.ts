import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { TenantMismatchError } from "../../src/lib/server/services/errors";
import { TenantScopeService } from "../../src/lib/server/services/tenant";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let first: SeededSchool;
let second: SeededSchool;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  first = schools[0];
  second = schools[1];
});

const serviceFor = (school: SeededSchool, overrides: Partial<ReturnType<typeof tenantOf>> = {}) =>
  createService(
    TenantScopeService,
    createServiceContext({ DB: env.DB }, {
      ...tenantOf(school),
      ...overrides
    })
  );

describe("tenant scope service", () => {
  it("accepts a matching academic year, class and section", async () => {
    await expect(serviceFor(first).assertScope()).resolves.toBeUndefined();
  });

  it("accepts an academic-only scope", async () => {
    await expect(
      serviceFor(first, { classId: null, sectionId: null }).assertScope()
    ).resolves.toBeUndefined();
  });

  it("rejects an academic year from another school", async () => {
    await expect(
      serviceFor(first, { academicId: second.academicId }).assertScope()
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });

  it("rejects a class and section from another school", async () => {
    await expect(
      serviceFor(first, {
        classId: second.classId,
        sectionId: second.sectionId
      }).assertScope()
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });

  it("accepts a tenant without an academic year so the middleware owns that error", async () => {
    await expect(
      serviceFor(first, { academicId: null, classId: null, sectionId: null }).assertScope()
    ).resolves.toBeUndefined();
  });
});
