import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { reportSettings } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext,
  requireScopedContext
} from "../../src/lib/server/services/context";
import { ReportSettingsService } from "../../src/lib/server/services/settings";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;

const fixturePayload = JSON.stringify({
  termlyReportTitle: "TERMLY SUMMARY OF PROGRESS REPORT",
  annualReportTitle: "ANNUAL SUMMARY OF PROGRESS REPORT",
  principalName: "Test Principal",
  supportEmail: "support@example.test",
  resultEmailSubject: "Result Notification",
  updatedAt: "2026-11-06T00:00:00.000Z",
  updatedBy: null
});

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
});

describe("report-settings import", () => {
  it("writes one row per school and re-reads the exact payload", async () => {
    const ctx = createServiceContext({ DB: env.DB }, tenantOf(school));
    const service = createService(ReportSettingsService, ctx);
    const scoped = requireScopedContext(ctx.repos.ctx);

    await ctx.repos.school.upsertReportSettings(
      scoped,
      fixturePayload,
      1_700_000_000
    );

    const rows = await db
      .select()
      .from(reportSettings)
      .where(eq(reportSettings.schoolId, school.schoolId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toBe(fixturePayload);
    expect(rows[0]?.updatedAt).toBe(1_700_000_000);

    const settings = await service.getReportSettings();
    expect(settings.principalName).toBe("Test Principal");
    expect(settings.supportEmail).toBe("support@example.test");
  });

  it("upserts instead of duplicating on a repeat import", async () => {
    const ctx = createServiceContext({ DB: env.DB }, tenantOf(school));
    const scoped = requireScopedContext(ctx.repos.ctx);

    await ctx.repos.school.upsertReportSettings(scoped, fixturePayload, 1_700_000_100);
    const rows = await db
      .select({ id: reportSettings.schoolId })
      .from(reportSettings)
      .where(eq(reportSettings.schoolId, school.schoolId));
    expect(rows).toHaveLength(1);
  });
});
