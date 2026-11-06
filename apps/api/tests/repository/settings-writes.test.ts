import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { smAcademicYears, smExamTypes, smGeneralSettings } from "../../src/lib/server/db/schema";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  createAcademicYear,
  createExamType,
  findNextExamTypeSequence,
  listAllExamTypes,
  listExamTypes,
  selectAcademicYearById,
  selectAcademicYears,
  selectGeneralSettings,
  setActiveAcademicYear,
  updateExamTypeActive,
  updateGeneralSettings
} from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
});

describe("general settings writes", () => {
  it("updates only the caller's row and ignores an empty patch", async () => {
    await updateGeneralSettings(first, { schoolName: "Renamed School" });
    const firstSettings = await selectGeneralSettings(first);
    const secondSettings = await selectGeneralSettings(second);

    expect(firstSettings[0]?.schoolName).toBe("Renamed School");
    expect(secondSettings[0]?.schoolName).toBe("School 2");

    await updateGeneralSettings(first, {});
    await expect(selectGeneralSettings(first)).resolves.toHaveLength(1);
  });
});

describe("academic year writes", () => {
  it("creates a planned year and can activate it", async () => {
    const id = await createAcademicYear(first, {
      year: "2027/2028",
      title: "Academic Year 2027/2028",
      startingDate: "2027-09-13",
      endingDate: "2028-07-07"
    });

    const created = await selectAcademicYearById(first, id);
    expect(created).toMatchObject({ year: "2027/2028", activeStatus: 0, status: "planned" });

    await setActiveAcademicYear(first, id);
    const years = await selectAcademicYears(first);
    expect(years.map((year) => [year.id, year.activeStatus])).toEqual([
      [schools[0].academicId, 0],
      [id, 1]
    ]);

    const otherYears = await selectAcademicYears(second);
    expect(otherYears.map((year) => year.activeStatus)).toEqual([1]);
  });

  it("does not activate a year belonging to another tenant", async () => {
    const foreignId = schools[1].academicId;
    await setActiveAcademicYear(first, foreignId);

    const years = await selectAcademicYears(first);
    expect(years.every((year) => year.activeStatus === 0)).toBe(true);
  });
});

describe("exam type writes", () => {
  it("computes the next sequence and creates an active term", async () => {
    await expect(findNextExamTypeSequence(first)).resolves.toBe(2);

    const id = await createExamType(first, { name: "SECOND TERM", sequence: 2 });
    const all = await listAllExamTypes(first);
    expect(all.map((term) => term.name)).toEqual(["FIRST TERM", "SECOND TERM"]);
    expect(all[1]?.activeStatus).toBe(1);

    await updateExamTypeActive(first, id, false);
    const active = await listExamTypes(first);
    expect(active.map((term) => term.name)).toEqual(["FIRST TERM"]);

    const secondTerms = await listAllExamTypes(second);
    expect(secondTerms.map((term) => term.name)).toEqual(["FIRST TERM"]);
  });

  it("keeps the tenant filter on deactivation", async () => {
    const secondTermId = schools[1].termId;
    await updateExamTypeActive(first, secondTermId, false);

    const rows = await db
      .select({ activeStatus: smExamTypes.activeStatus })
      .from(smExamTypes)
      .where(eq(smExamTypes.id, secondTermId));
    expect(rows[0]?.activeStatus).toBe(1);
  });
});

describe("schema invariants used by the service layer", () => {
  it("keeps one settings row per school", async () => {
    const rows = await db
      .select({ id: smGeneralSettings.id })
      .from(smGeneralSettings)
      .where(eq(smGeneralSettings.schoolId, schools[0].schoolId));
    expect(rows).toHaveLength(1);
  });

  it("keeps the academic year unique per school", async () => {
    await expect(
      createAcademicYear(first, {
        year: "2027/2028",
        title: "Duplicate",
        startingDate: "2027-09-13",
        endingDate: "2028-07-07"
      })
    ).rejects.toThrow();

    const rows = await db
      .select({ id: smAcademicYears.id })
      .from(smAcademicYears)
      .where(eq(smAcademicYears.schoolId, schools[0].schoolId));
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
