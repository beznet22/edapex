import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createService, createServiceContext } from "../../src/lib/server/services/context";
import { IntegrityService } from "../../src/lib/server/services/migration";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
});

const service = () =>
  createService(IntegrityService, createServiceContext({ DB: env.DB }, tenantOf(school)));

describe("integrity service", () => {
  it("reports a green identity gate and a red target staffing gate", async () => {
    const report = await service().report(school.academicId);
    expect(report.blockingIdentity).toBe(0);
    expect(report.findings.find((finding) => finding.id === "P3")?.count).toBe(0);
    expect(report.findings.find((finding) => finding.id === "TERM_DATES")?.count).toBe(0);
    expect(report.readiness.targetCurrentRecords).toBe(1);
    expect(report.readiness.unreviewedSections).toBe(1);
    expect(report.blockingTarget).toBeGreaterThan(0);
    expect(report.gate).toBe("red");
  });

  it("refuses activation while the target is unreviewed", async () => {
    await expect(service().assertActivationGate(school.academicId)).rejects.toMatchObject({
      message: expect.stringContaining("STAFFING_REVIEW_REQUIRED")
    });
  });
});
