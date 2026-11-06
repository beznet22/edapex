import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { ReportSettingsService } from "../../src/lib/server/services/settings";
import { ValidationError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let service: ReportSettingsService;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  service = createService(
    ReportSettingsService,
    createServiceContext({ DB: env.DB }, tenantOf(school))
  );
});

describe("report settings service", () => {
  it("returns the legacy defaults before the first save", async () => {
    const settings = await service.getReportSettings();
    expect(settings).toMatchObject({
      termlyReportTitle: "TERMLY SUMMARY OF PROGRESS REPORT",
      annualReportTitle: "ANNUAL SUMMARY OF PROGRESS REPORT",
      principalName: "Patience Okwube"
    });
    expect(settings.updatedBy).toBeNull();
  });

  it("saves a patch through the D1 adapter and re-reads it", async () => {
    const saved = await service.saveReportSettings(
      { principalName: "New Principal", resultEmailSubject: "Your results" },
      school.userId
    );
    expect(saved.principalName).toBe("New Principal");
    expect(saved.updatedBy).toBe(school.userId);

    const reread = await service.getReportSettings();
    expect(reread.principalName).toBe("New Principal");
    expect(reread.resultEmailSubject).toBe("Your results");
  });

  it("rejects unknown keys and a missing actor", async () => {
    await expect(
      service.saveReportSettings({ principalName: "X", unknown: true }, school.userId)
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      service.saveReportSettings({ principalName: "X" }, 0)
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
