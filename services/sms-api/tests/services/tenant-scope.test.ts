import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { TenantMismatchError } from "../../src/lib/server/services/errors";
import { TenantScopeService } from "../../src/lib/server/services/tenant";
import {
  smAssignSubjects,
  smClassSections,
  smClasses
} from "../../src/lib/server/db/schema";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let first: SeededSchool;
let second: SeededSchool;
let otherClassId: number;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  first = schools[0];
  second = schools[1];

  /*
   * A real second class in the same school that the teacher does not teach.
   *
   * Seeded here rather than in `seedTwoSchools` because that fixture's exact row counts are
   * asserted by other tests — growing it would make "same school, not assigned" expressible
   * at the cost of breaking half the suite. A section that simply does not exist proves
   * nothing: it fails the school check first and never reaches the assignment check.
   */
  /*
   * The teacher's real assignment, created here rather than in `seedTwoSchools`: the shared
   * fixture must not imply a teaching assignment, because tests that assert "no assignment"
   * (and the promotion/assessment suites) read it. Each test states its own preconditions.
   */
  await db.insert(smAssignSubjects).values({
    teacherId: first.staffId,
    classId: first.classId,
    sectionId: first.sectionId,
    subjectId: first.subjectId,
    schoolId: first.schoolId,
    academicId: first.academicId,
    activeStatus: 1
  });

  otherClassId = first.classId + 900;
  await db.insert(smClasses).values({
    id: otherClassId,
    className: "Unassigned",
    schoolId: first.schoolId,
    academicId: first.academicId
  });
  await db.insert(smClassSections).values({
    id: otherClassId,
    classId: otherClassId,
    sectionId: first.sectionId,
    schoolId: first.schoolId,
    academicId: first.academicId,
    activeStatus: 1
  });
});

const serviceFor = (
  school: SeededSchool,
  overrides: Partial<ReturnType<typeof tenantOf>> = {},
  isAdmin = false
) =>
  createService(
    TenantScopeService,
    createServiceContext({ DB: env.DB }, {
      ...tenantOf(school),
      ...overrides
    })
  ).assertScope(isAdmin);

describe("tenant scope service", () => {
  it("accepts a section the teacher is assigned to", async () => {
    await expect(serviceFor(first)).resolves.toBeUndefined();
  });

  it("accepts an academic-only scope", async () => {
    await expect(
      serviceFor(first, { classId: null, sectionId: null })
    ).resolves.toBeUndefined();
  });

  it("rejects an academic year from another school", async () => {
    await expect(
      serviceFor(first, { academicId: second.academicId })
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });

  /*
   * The hole this test exists for: before the assignment check, a teacher could send any
   * `X-Class-Id` from their own school and read that section. The header is
   * self-describing, so "belongs to my school" proved nothing about whether they teach it.
   */
  it("rejects a section in the same school that the teacher is not assigned to", async () => {
    await expect(
      serviceFor(first, {
        classId: otherClassId,
        sectionId: first.sectionId
      })
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });

  it("rejects a class and section from another school", async () => {
    await expect(
      serviceFor(first, {
        classId: second.classId,
        sectionId: second.sectionId
      })
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });

  it("lets an admin reach any section in their school", async () => {
    await expect(
      serviceFor(
        first,
        { classId: otherClassId, sectionId: first.sectionId },
        true
      )
    ).resolves.toBeUndefined();
  });

  /*
   * A parent or student has no staff row and therefore no assignments. They are bounded by
   * the routes they can reach, not by a class list — so scope must not reject them here or
   * every parent-facing route would break.
   */
  it("does not apply the assignment check without a staff record", async () => {
    await expect(
      serviceFor(first, { staffId: null, classId: otherClassId })
    ).resolves.toBeUndefined();
  });

  it("accepts a tenant without an academic year so the middleware owns that error", async () => {
    await expect(
      serviceFor(first, { academicId: null, classId: null, sectionId: null })
    ).resolves.toBeUndefined();
  });
});
