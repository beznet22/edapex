import { and, eq, gte } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  assignClassTeacher,
  assignSubjectTeacher,
  assignSubjects,
  createStaff,
  findAssignedClassSection,
  findAssignedTeacher,
  findClassSectionById,
  findClassSectionByName,
  listAssignedSubjects,
  listClassSections,
  listSubjectsByClass,
  searchClassSections
} from "../../src/lib/server/repository";
import { smAssignSubjects } from "../../src/lib/server/db/schema";
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

describe("class sections", () => {
  it("finds and lists class sections for the caller's tenant", async () => {
    await expect(
      findClassSectionById(first, schools[0].classId, schools[0].sectionId)
    ).resolves.toMatchObject({ id: schools[0].classSectionId, className: "CLASS 1" });

    await expect(listClassSections(first)).resolves.toHaveLength(1);
    await expect(listClassSections(second)).resolves.toHaveLength(1);

    const other = await listClassSections(second);
    expect(other[0]?.id).toBe(schools[1].classSectionId);
  });

  it("resolves names case-insensitively and searches by class or section", async () => {
    await expect(findClassSectionByName(first, "class 1", "a")).resolves.toEqual({
      classId: schools[0].classId,
      sectionId: schools[0].sectionId
    });
    await expect(findClassSectionByName(first, "unknown", "a")).resolves.toBeNull();

    const byClass = await searchClassSections(first, "class 1");
    expect(byClass).toEqual([
      {
        classId: schools[0].classId,
        className: "CLASS 1",
        sectionId: schools[0].sectionId,
        sectionName: "A"
      }
    ]);
    await expect(searchClassSections(first, "missing")).resolves.toEqual([]);
  });

  it("finds an assigned class section through subject assignments", async () => {
    await assignSubjectTeacher(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      staffId: schools[0].staffId
    });

    await expect(
      findAssignedClassSection(first, { staffId: schools[0].staffId })
    ).resolves.toMatchObject({ classId: schools[0].classId, id: schools[0].classSectionId });

    await expect(
      findAssignedClassSection(second, { staffId: schools[1].staffId })
    ).resolves.toBeNull();

    await assignSubjectTeacher(second, {
      classId: schools[1].classId,
      sectionId: schools[1].sectionId,
      subjectId: schools[1].subjectId,
      staffId: schools[1].staffId
    });
    await expect(
      findAssignedClassSection(second, { staffId: schools[1].staffId })
    ).resolves.toMatchObject({ classId: schools[1].classId });
  });
});

describe("assignments", () => {
  it("assigns a subject teacher and reads the assignment back", async () => {
    await expect(
      assignSubjectTeacher(first, {
        classId: schools[0].classId,
        sectionId: schools[0].sectionId,
        subjectId: schools[0].subjectId,
        staffId: schools[0].staffId
      })
    ).resolves.toBeUndefined();

    const subjects = await listAssignedSubjects(first, schools[0].classId, schools[0].sectionId);
    expect(subjects).toEqual([
      { subjectId: schools[0].subjectId, subjectCode: null, teacherId: schools[0].staffId }
    ]);

    const assigned = await findAssignedTeacher(
      first,
      schools[0].subjectId,
      schools[0].classId,
      schools[0].sectionId
    );
    expect(assigned?.teacherId).toBe(schools[0].staffId);
  });

  it("lists subjects taught in a class section", async () => {
    const subjects = await listSubjectsByClass(first, schools[0].classId, schools[0].sectionId);
    expect(subjects.map((subject) => subject.id)).toEqual([schools[0].subjectId]);
    expect(subjects[0]?.teacherId).toBe(schools[0].staffId);
  });

  it("creates the class-teacher header once and replaces the active slot", async () => {
    const secondStaffId = await createStaff(first, {
      firstName: "Second",
      lastName: "Teacher",
      fullName: "Second Teacher",
      email: "second.teacher@example.test",
      userId: schools[0].userId,
      designationId: schools[0].designationId,
      departmentId: schools[0].departmentId,
      roleId: schools[0].roleId,
      genderId: schools[0].genderId,
      activeStatus: 1
    });

    const initial = await assignClassTeacher(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      staffId: schools[0].staffId
    });
    expect(initial.assignClassTeacherId).toBeGreaterThan(0);

    const replacement = await assignClassTeacher(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      staffId: secondStaffId
    });
    expect(replacement.assignClassTeacherId).toBe(initial.assignClassTeacherId);
  });

  it("bulk-inserts subject assignments in atomic chunks", async () => {
    const rows = Array.from({ length: 96 }, (_, index) => ({
      id: 7_000 + index,
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      teacherId: schools[0].staffId,
      activeStatus: 1
    }));
    await expect(assignSubjects(first, rows)).resolves.toBe(true);

    const assignments = await db
      .select({ id: smAssignSubjects.id })
      .from(smAssignSubjects)
      .where(
        and(
          gte(smAssignSubjects.id, 7_000),
          eq(smAssignSubjects.schoolId, schools[0].schoolId)
        )
      );
    expect(assignments).toHaveLength(96);
  });
});
