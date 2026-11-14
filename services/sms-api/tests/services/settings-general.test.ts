import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { smGeneralSettings } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { GeneralSettingsService } from "../../src/lib/server/services/settings";
import { ValidationError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let school: SeededSchool;
let service: GeneralSettingsService;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  school = schools[0];
  service = createService(
    GeneralSettingsService,
    createServiceContext({ DB: env.DB }, tenantOf(school))
  );
});

describe("general settings service", () => {
  it("reads the tenant's active settings surface", async () => {
    const settings = await service.getGeneralSettings();
    expect(settings?.schoolName).toBe("School 1");
    expect(settings).not.toHaveProperty("extras");
  });

  it("updates only the supplied fields and re-reads the row", async () => {
    const updated = await service.saveGeneralSettings({
      schoolName: "Renamed School",
      phone: "0700000099"
    });
    expect(updated).toMatchObject({ schoolName: "Renamed School", phone: "0700000099" });

    const second = await createService(
      GeneralSettingsService,
      createServiceContext({ DB: env.DB }, tenantOf(schools[1]))
    ).getGeneralSettings();
    expect(second?.schoolName).toBe("School 2");
  });

  it("rejects unknown fields instead of mass-assigning them", async () => {
    await expect(
      service.saveGeneralSettings({ schoolName: "X", unexpected: true })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("resolves the school identity and rejects a foreign school id", async () => {
    await expect(service.resolveSchoolIdentity(school.schoolId)).resolves.toMatchObject({
      name: "School 1",
      email: "office1@example.test",
      phone: "0700000001"
    });
    await expect(service.resolveSchoolIdentity(999)).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not create a second settings row", async () => {
    const rows = await db
      .select({ id: smGeneralSettings.id })
      .from(smGeneralSettings)
      .where(eq(smGeneralSettings.schoolId, school.schoolId));
    expect(rows).toHaveLength(1);
  });
});
