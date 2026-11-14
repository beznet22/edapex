import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { upsertClassAttendance } from "../../src/lib/server/repository";
import { classAttendances } from "../../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
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

describe("class attendance", () => {
  it("inserts and then updates the same (student, term) aggregate", async () => {
    const inserted = await upsertClassAttendance(first, {
      studentId: schools[0].studentId,
      examTypeId: schools[0].termId,
      daysOpened: 60,
      daysPresent: 55,
      daysAbsent: 5
    });
    expect(inserted).toBeGreaterThan(0);

    const updated = await upsertClassAttendance(first, {
      studentId: schools[0].studentId,
      examTypeId: schools[0].termId,
      daysOpened: 61,
      daysPresent: 56,
      daysAbsent: 5
    });
    expect(updated).toBe(inserted);

    const rows = await db
      .select()
      .from(classAttendances)
      .where(eq(classAttendances.id, inserted ?? 0));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      daysOpened: 61,
      daysPresent: 56,
      daysAbsent: 5,
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId
    });
  });

  it("returns null when the natural key is incomplete", async () => {
    await expect(
      upsertClassAttendance(first, { studentId: null, examTypeId: schools[0].termId })
    ).resolves.toBeNull();
    await expect(
      upsertClassAttendance(first, { studentId: schools[0].studentId, examTypeId: null })
    ).resolves.toBeNull();
  });

  it("keeps each school's aggregate separate", async () => {
    const id = await upsertClassAttendance(second, {
      studentId: schools[1].studentId,
      examTypeId: schools[1].termId,
      daysOpened: 40,
      daysPresent: 40,
      daysAbsent: 0
    });
    expect(id).toBeGreaterThan(0);

    const rows = await db.select().from(classAttendances);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.schoolId))).toEqual(
      new Set([schools[0].schoolId, schools[1].schoolId])
    );
  });
});
