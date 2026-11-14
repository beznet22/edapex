import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { AcademicSettingsService } from "../../src/lib/server/services/settings";
import { ValidationError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let service: AcademicSettingsService;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  service = createService(
    AcademicSettingsService,
    createServiceContext({ DB: env.DB }, tenantOf(school))
  );
});

describe("academic settings service", () => {
  it("lists academic years and resolves the active one", async () => {
    const years = await service.listAcademicYears();
    expect(years).toHaveLength(1);

    const active = await service.getActiveAcademicYear();
    expect(active?.id).toBe(school.academicId);
  });

  it("creates and activates an academic year", async () => {
    const created = await service.createAcademicYear({
      year: "2027/2028",
      title: "Academic Year 2027/2028",
      startingDate: "2027-09-13",
      endingDate: "2028-07-07"
    });
    expect(created).toMatchObject({ year: "2027/2028", activeStatus: 0 });

    const years = await service.setActiveAcademicYear(created.id);
    expect(years.find((year) => year.id === created.id)?.activeStatus).toBe(1);
    expect(years.find((year) => year.id === school.academicId)?.activeStatus).toBe(0);
  });

  it("rejects duplicate, malformed or mass-assigned academic years", async () => {
    await expect(
      service.createAcademicYear({
        year: "2027/2028",
        title: "Duplicate",
        startingDate: "2027-09-13",
        endingDate: "2028-07-07"
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      service.createAcademicYear({
        year: "2028/2029",
        title: "Bad dates",
        startingDate: "2028-09-13",
        endingDate: "2028-07-07"
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      service.createAcademicYear({
        year: "2028/2029",
        title: "Unexpected",
        startingDate: "2028-09-13",
        endingDate: "2029-07-07",
        unexpected: true
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("lists, creates and toggles exam types", async () => {
    await expect(service.listExamTypes()).resolves.toHaveLength(1);
    const created = await service.createExamType({ name: "SECOND TERM" });
    expect(created.sequence).toBe(2);
    expect(created.activeStatus).toBe(1);

    const inactive = await service.toggleExamTypeActive(created.id);
    expect(inactive?.activeStatus).toBe(0);

    const activeAgain = await service.toggleExamTypeActive(created.id);
    expect(activeAgain?.activeStatus).toBe(1);
  });

  it("returns null when toggling an unknown exam type", async () => {
    await expect(service.toggleExamTypeActive(999999)).resolves.toBeNull();
  });
});
