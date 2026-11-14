import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createService, createServiceContext } from "../../src/lib/server/services/context";
import { BootstrapService } from "../../src/lib/server/services/migration";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
});

const service = () =>
  createService(BootstrapService, createServiceContext({ DB: env.DB }, tenantOf(school)));

describe("bootstrap service", () => {
  it("plans without writing and includes the three UPPER BASIC classes", async () => {
    const result = await service().start(
      {
        newSession: {
          id: 500,
          year: "2099",
          title: "2099/2100",
          startsOn: "2099-09-14",
          endsOn: "2100-07-30"
        },
        copyFromSessionId: school.academicId,
        terms: [],
        dryRun: true
      },
      school.userId
    );
    expect("dryRun" in result).toBe(true);
    if (!("dryRun" in result)) return;
    expect(result.counts.classes).toBe(4);
    expect(result.counts.sections).toBe(1);
    expect(result.counts.classSections).toBe(4);
    expect(result.readiness.unreviewedSections).toBe(4);
  });
});
