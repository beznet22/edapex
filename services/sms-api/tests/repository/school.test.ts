import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  findActiveAcademicYear,
  findAcademicYearById,
  findGeneralSettingBySchoolId,
  findSchoolInfo,
  listAcademicYears,
  listGeneralSettings,
  resolveAcademicId,
  selectAcademicYearById,
  selectAcademicYears,
  selectActiveAcademicYear,
  selectGeneralSettingBySchoolId,
  selectGeneralSettings
} from "../../src/lib/server/repository";
import { smGeneralSettings } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { expectTenantIsolation } from "../support/isolation";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
});

describe("school repository", () => {
  it("returns only the caller's school header", async () => {
    await expect(findSchoolInfo(first)).resolves.toEqual({
      schoolName: "School 1",
      email: "office1@example.test",
      phone: "0700000001"
    });
    await expect(findSchoolInfo(second)).resolves.toEqual({
      schoolName: "School 2",
      email: "office2@example.test",
      phone: "0700000002"
    });
  });

  it("projects the active settings surface and never reads across tenants", async () => {
    const settings = await selectGeneralSettings(first);
    expect(settings).toHaveLength(1);
    expect(settings[0]?.schoolName).toBe("School 1");
    expect(Object.keys(settings[0] ?? {})).not.toContain("extras");
    await expect(selectGeneralSettings(second)).resolves.toHaveLength(1);
  });

  it("requires an explicit, matching school id", async () => {
    await expect(selectGeneralSettingBySchoolId(first, 1)).resolves.not.toBeNull();
    await expect(selectGeneralSettingBySchoolId(first, 2)).resolves.toBeNull();
  });
});

describe("config cache", () => {
  it("loads settings and years once per request and honours a forced refresh", async () => {
    const ctx = createRepositoryContext(db, tenantOf(schools[0]));
    const loaded = await listAcademicYears(ctx);
    expect(loaded).toHaveLength(1);
    expect(ctx.config.loadedAt).not.toBeNull();

    await db
      .update(smGeneralSettings)
      .set({ schoolName: "Renamed School" })
      .where(eq(smGeneralSettings.id, schools[0].settingsId));

    const cached = await listGeneralSettings(ctx);
    expect(cached[0]?.schoolName).toBe("School 1");

    const refreshed = await listGeneralSettings(ctx, true);
    expect(refreshed[0]?.schoolName).toBe("Renamed School");

    await db
      .update(smGeneralSettings)
      .set({ schoolName: "School 1" })
      .where(eq(smGeneralSettings.id, schools[0].settingsId));
  });

  it("finds the active year by date range and resolves its id", async () => {
    const active = await findActiveAcademicYear(first);
    expect(active?.id).toBe(schools[0].academicId);
    await expect(resolveAcademicId(first)).resolves.toBe(schools[0].academicId);
    await expect(findAcademicYearById(first, schools[0].academicId)).resolves.toMatchObject({
      id: schools[0].academicId
    });
    await expect(findAcademicYearById(first, schools[1].academicId)).resolves.toBeNull();
    await expect(findGeneralSettingBySchoolId(first, 1)).resolves.not.toBeNull();
    await expect(selectAcademicYearById(first, schools[0].academicId)).resolves.toMatchObject({
      id: schools[0].academicId
    });
  });

  it("keeps cached reads tenant-scoped", async () => {
    const years = await selectAcademicYears(first);
    expect(years).toHaveLength(1);
    const secondYears = await selectAcademicYears(second);
    expect(secondYears[0]?.id).toBe(schools[1].academicId);
  });
});

describe("active year selection", () => {
  const window = (id: number, start: string, end: string, active: number | null) => ({
    id,
    startingDate: start,
    endingDate: end,
    activeStatus: active
  });

  it("picks the newest year whose range contains the day", () => {
    const years = [
      window(1, "2025-09-14", "2026-07-10", 1),
      window(2, "2026-09-14", "2027-07-10", 1)
    ];
    expect(selectActiveAcademicYear(years, new Date("2026-11-06T00:00:00Z"))?.id).toBe(2);
  });

  it("falls back to the newest active year when no range matches", () => {
    const years = [
      window(1, "2025-09-14", "2026-07-10", 1),
      window(2, "2026-09-14", "2027-07-10", 1)
    ];
    expect(selectActiveAcademicYear(years, new Date("2026-08-01T00:00:00Z"))?.id).toBe(2);
  });

  it("returns null when nothing is active", () => {
    const years = [window(1, "2025-09-14", "2026-07-10", 0)];
    expect(selectActiveAcademicYear(years, new Date("2026-08-01T00:00:00Z"))).toBeNull();
  });
});

describe("tenant isolation", () => {
  it("never returns another school's settings or years", async () => {
    await expectTenantIsolation(db, schools, [
      { name: "selectGeneralSettings", run: selectGeneralSettings }
    ]);
    await expectTenantIsolation(db, schools, [
      { name: "selectAcademicYears", run: selectAcademicYears }
    ]);
  });
});
