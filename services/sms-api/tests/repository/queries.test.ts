import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  findParentByAdmissionNo,
  findParentByStudentId,
  findStaffByClassSection,
  findStaffRegistrationOptions,
  searchParentsByStudentName
} from "../../src/lib/server/repository";
import { smAssignSubjects } from "../../src/lib/server/db/schema";
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

  await db.insert(smAssignSubjects).values({
    id: 9001,
    teacherId: schools[0].staffId,
    classId: schools[0].classId,
    sectionId: schools[0].sectionId,
    subjectId: schools[0].subjectId,
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId,
    activeStatus: 1
  });
  await db.insert(smAssignSubjects).values({
    id: 9002,
    teacherId: schools[1].staffId,
    classId: schools[1].classId,
    sectionId: schools[1].sectionId,
    subjectId: schools[1].subjectId,
    schoolId: schools[1].schoolId,
    academicId: schools[1].academicId,
    activeStatus: 1
  });
});

describe("cross-aggregate parent search", () => {
  it("finds a guardian through the student and the admission number", async () => {
    await expect(findParentByStudentId(first, schools[0].studentId)).resolves.toMatchObject({
      parentId: schools[0].parentId,
      studentName: "Student 1"
    });
    await expect(findParentByAdmissionNo(first, 114)).resolves.toMatchObject({
      parentId: schools[0].parentId
    });
    await expect(findParentByStudentId(first, schools[1].studentId)).resolves.toBeNull();
  });

  it("searches guardians by their student's name", async () => {
    const rows = await searchParentsByStudentName(first, "Student 1");
    expect(rows.map((row) => row.parentId)).toEqual([schools[0].parentId]);
    await expect(searchParentsByStudentName(first, "Unknown")).resolves.toEqual([]);
  });

  it("keeps the student join tenant-scoped", async () => {
    await expectTenantIsolation(db, schools, [
      {
        name: "searchParentsByStudentName",
        run: (ctx) => searchParentsByStudentName(ctx, "Student")
      }
    ]);
  });
});

describe("staff by class section", () => {
  it("reads the subject assignment for the caller's tenant and year", async () => {
    await expect(
      findStaffByClassSection(first, {
        classId: schools[0].classId,
        sectionId: schools[0].sectionId
      })
    ).resolves.toMatchObject({ id: 9001, teacherId: schools[0].staffId });

    await expect(
      findStaffByClassSection(second, {
        classId: schools[0].classId,
        sectionId: schools[0].sectionId
      })
    ).resolves.toBeNull();
  });
});

describe("registration options", () => {
  it("composes every staff form dictionary inside the tenant", async () => {
    const options = await findStaffRegistrationOptions(first);
    expect(options.designations).toEqual([
      { id: schools[0].designationId, name: "teacher" }
    ]);
    expect(options.departments).toEqual([
      { id: schools[0].departmentId, name: "Academic" }
    ]);
    expect(options.roles).toEqual([{ id: schools[0].roleId, name: "Teacher" }]);
    expect(options.genders).toEqual([{ id: schools[0].genderId, name: "Male" }]);
  });
});
