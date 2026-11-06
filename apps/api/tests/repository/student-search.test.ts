import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  findStudentDetails,
  findStudentRegistrationOptions,
  listStudentsByClassSection,
  listStudentsByStaffId,
  listStudentsGroupedByParent,
  searchStudents
} from "../../src/lib/server/repository";
import { smAssignSubjects } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { expectTenantIsolation } from "../support/isolation";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));

  await db.insert(smAssignSubjects).values({
    id: 9_101,
    teacherId: schools[0].staffId,
    classId: schools[0].classId,
    sectionId: schools[0].sectionId,
    subjectId: schools[0].subjectId,
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId,
    activeStatus: 1
  });
});

describe("student placement search", () => {
  it("reads the class roster through the current record", async () => {
    const roster = await listStudentsByClassSection(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId
    });
    expect(roster).toEqual([{ id: schools[0].studentId, name: "Student 1", admissionNo: 114 }]);

    const filtered = await listStudentsByClassSection(
      first,
      { classId: schools[0].classId, sectionId: schools[0].sectionId },
      "Student"
    );
    expect(filtered).toHaveLength(1);
    await expect(
      listStudentsByClassSection(first, { classId: 0, sectionId: 0 })
    ).resolves.toEqual([]);
  });

  it("searches by name and by admission number within the placement", async () => {
    const byName = await searchStudents(first, "Student");
    expect(byName.map((row) => row.studentId)).toEqual([schools[0].studentId]);
    expect(byName[0]).toMatchObject({ className: "CLASS 1", sectionName: "A" });

    const byAdmission = await searchStudents(first, "114");
    expect(byAdmission.map((row) => row.studentId)).toEqual([schools[0].studentId]);

    const filtered = await searchStudents(first, "Student", {
      classId: schools[1].classId
    });
    expect(filtered).toEqual([]);
  });

  it("lists the students in a staff member's assigned class section", async () => {
    const students = await listStudentsByStaffId(first, schools[0].staffId);
    expect(students?.map((row) => row.id)).toEqual([schools[0].studentId]);
    await expect(listStudentsByStaffId(first, schools[1].staffId)).resolves.toBeNull();
    await expect(listStudentsByStaffId(first)).resolves.toHaveLength(1);
  });

  it("groups students by parent", async () => {
    const grouped = await listStudentsGroupedByParent(first);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      studentId: schools[0].studentId,
      parentId: schools[0].parentId,
      guardiansName: "Guardian 1"
    });
  });

  it("keeps roster reads tenant-scoped", async () => {
    await expectTenantIsolation(db, schools, [
      {
        name: "listStudentsByClassSection",
        run: (ctx) =>
          listStudentsByClassSection(ctx, {
            classId: ctx.tenant.classId ?? 0,
            sectionId: ctx.tenant.sectionId ?? 0
          })
      }
    ]);
  });
});

describe("student details", () => {
  it("joins parent, dictionaries and the current placement", async () => {
    await expect(findStudentDetails(first, schools[0].studentId)).resolves.toMatchObject({
      studentId: schools[0].studentId,
      fullName: "Student 1",
      guardiansName: "Guardian 1",
      genderName: "Male",
      categoryName: "LOWERBASIC",
      className: "CLASS 1",
      sectionName: "A",
      studentRecordId: schools[0].recordId
    });

    await expect(findStudentDetails(first, 114, true)).resolves.toMatchObject({
      studentId: schools[0].studentId
    });
    await expect(findStudentDetails(first, schools[1].studentId)).resolves.toBeNull();
  });

  it("composes the student registration form options for the tenant", async () => {
    const options = await findStudentRegistrationOptions(first);
    expect(options.classes).toEqual([{ id: schools[0].classId, name: "CLASS 1" }]);
    expect(options.sections).toEqual([{ id: schools[0].sectionId, name: "A" }]);
    expect(options.categories).toEqual([
      { id: schools[0].categoryId, name: "LOWERBASIC" }
    ]);
    expect(options.genders).toEqual([{ id: schools[0].genderId, name: "Male" }]);
    expect(options.guardianRelations).toHaveLength(3);
  });
});
