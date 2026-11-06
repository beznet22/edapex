import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createService,
  createServiceContext,
  requireScopedContext,
  ServiceCache
} from "../../src/lib/server/services/context";
import type { ServiceContext } from "../../src/lib/server/services/context";
import {
  CloudflareEmailAdapter,
  GmailEmailAdapter
} from "../../src/lib/server/services/adapters";
import { TenantScopeError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];

class Probe {
  constructor(readonly ctx: ServiceContext) {}
}

beforeAll(async () => {
  schools = await seedTwoSchools(db);
});

describe("service context", () => {
  it("builds one frozen scoped context with bound repositories and ports", async () => {
    const ctx = createServiceContext({ DB: env.DB }, tenantOf(schools[0]));

    expect(ctx.tenant?.schoolId).toBe(schools[0].schoolId);
    expect(ctx.repos.ctx.tenant?.schoolId).toBe(schools[0].schoolId);
    expect(ctx.config).toBe(ctx.repos.ctx.config);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(typeof ctx.repos.school.listAcademicYears).toBe("function");
    expect(typeof ctx.repos.assessments.listExamTypes).toBe("function");
    expect(typeof ctx.repos.fees.listFeeMastersByClass).toBe("function");
  });

  it("exposes a scoped roster through the StudentDirectory port", async () => {
    const ctx = createServiceContext({ DB: env.DB }, tenantOf(schools[0]));
    const roster = await ctx.ports.students.listRoster({
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      academicId: schools[0].academicId
    });

    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({
      id: schools[0].studentId,
      name: "Student 1",
      admissionNo: schools[0].studentId
    });
  });

  it("round-trips report settings through the D1 adapter", async () => {
    const ctx = createServiceContext({ DB: env.DB }, tenantOf(schools[1]));

    const initial = await ctx.ports.reportSettings.get();
    expect(initial.principalName).toBe("Patience Okwube");

    const saved = await ctx.ports.reportSettings.save(
      { principalName: "New Principal" },
      schools[1].userId
    );
    expect(saved.principalName).toBe("New Principal");
    expect(saved.updatedBy).toBe(schools[1].userId);

    const reread = await ctx.ports.reportSettings.get();
    expect(reread.principalName).toBe("New Principal");
    expect(reread.updatedBy).toBe(schools[1].userId);
  });

  it("returns an unscoped context for pre-tenant auth and refuses scoped reads", async () => {
    const ctx = createServiceContext({ DB: env.DB }, null);
    expect(ctx.tenant).toBeNull();
    expect(ctx.repos.ctx.tenant).toBeNull();
    expect(() => requireScopedContext(ctx.repos.ctx)).toThrow(TenantScopeError);
    await expect(
      ctx.ports.students.listRoster({
        classId: 1,
        sectionId: 1,
        academicId: 1
      })
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("constructs services only through createService and keeps caches request-scoped", () => {
    const ctx = createServiceContext({ DB: env.DB }, tenantOf(schools[0]));
    const probe = createService(Probe, ctx);
    expect(probe.ctx).toBe(ctx);

    const first = new ServiceCache();
    const second = new ServiceCache();
    first.set("x", 1);
    expect(first.has("x")).toBe(true);
    expect(second.has("x")).toBe(false);
  });

  it("lets tests override ports without changing the context type", () => {
    const ctx = createServiceContext({ DB: env.DB }, tenantOf(schools[0]), {
      ports: { clock: { now: () => 42 } }
    });
    expect(ctx.ports.clock.now()).toBe(42);
    expect(ctx.ports.email).toBeDefined();
  });

  it("selects Gmail when its OAuth variables are present and Cloudflare otherwise", () => {
    const gmail = createServiceContext(
      {
        DB: env.DB,
        GMAIL_CLIENT_ID: "client-id",
        GMAIL_CLIENT_SECRET: "client-secret",
        GMAIL_REFRESH_TOKEN: "refresh-token",
        GMAIL_SENDER_EMAIL: "school@example.test"
      },
      null
    );
    const fallback = createServiceContext({ DB: env.DB }, null);

    expect(gmail.ports.email).toBeInstanceOf(GmailEmailAdapter);
    expect(fallback.ports.email).toBeInstanceOf(CloudflareEmailAdapter);
  });
});
