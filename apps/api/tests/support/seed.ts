import { createUnscopedContext } from "../../src/lib/server/repository/base/repository-context";
import type {
  RepositoryDb,
  TenantContext
} from "../../src/lib/server/repository/base/repository-context";import {
  infixRoles,
  smAcademicYears,
  smBaseGroups,
  smBaseSetups,
  smClasses,
  smDesignations,
  smExamTypes,
  smGeneralSettings,
  smHumanDepartments,
  smParents,
  smSchools,
  smSections,
  smStaffs,
  smStudentCategories,
  smStudents,
  smSubjects,
  studentRecords,
  users
} from "../../src/lib/server/db/schema";

export interface SeededSchool {
  readonly schoolId: number;
  readonly academicId: number;
  readonly roleId: number;
  readonly userId: number;
  readonly baseGroupId: number;
  readonly genderId: number;
  readonly designationId: number;
  readonly departmentId: number;
  readonly categoryId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly subjectId: number;
  readonly termId: number;
  readonly staffId: number;
  readonly parentId: number;
  readonly studentId: number;
  readonly recordId: number;
  readonly settingsId: number;
}

export interface SeedOptions {
  readonly className?: string;
  readonly studentAdmissionNo?: number;
  readonly studentRecordStatus?: "current" | "promoted" | "repeated" | "graduated" | "withdrawn";
}

/** A scoped tenant for the seeded school; `createRepositoryContext` needs one. */
export const tenantOf = (school: SeededSchool): TenantContext => ({
  schoolId: school.schoolId,
  userId: school.userId,
  staffId: school.staffId,
  designationId: school.designationId,
  roleId: school.roleId,
  academicId: school.academicId,
  classId: null,
  sectionId: null
});

export const database = (env: { readonly DB: D1Database }): RepositoryDb =>
  createUnscopedContext(env).db;

/**
 * Seeds one complete, self-consistent school. Explicit ids keep fixtures
 * deterministic; school 1 uses the 100 block, school 2 the 200 block.
 */
export async function seedSchool(
  db: RepositoryDb,
  schoolId: number,
  options: SeedOptions = {}
): Promise<SeededSchool> {
  const base = schoolId * 100;
  const roleId = base + 1;
  const userId = base + 2;
  const academicId = base + 3;
  const baseGroupId = base + 4;
  const genderId = base + 5;
  const designationId = base + 6;
  const departmentId = base + 7;
  const categoryId = base + 8;
  const classId = base + 9;
  const sectionId = base + 10;
  const subjectId = base + 11;
  const staffId = base + 12;
  const parentId = base + 13;
  const studentId = base + 14;
  const recordId = base + 15;
  const termId = base + 16;
  const settingsId = base + 17;

  await db.insert(smSchools).values({
    id: schoolId,
    schoolName: `School ${schoolId}`,
    email: `office${schoolId}@example.test`,
    phone: `070000000${schoolId}`
  });
  await db.insert(infixRoles).values({ id: roleId, name: "Teacher", schoolId });
  await db.insert(users).values({
    id: userId,
    fullName: `User ${schoolId}`,
    email: `user${schoolId}@example.test`,
    schoolId,
    roleId
  });
  await db.insert(smAcademicYears).values({
    id: academicId,
    year: `2026/${schoolId}`,
    title: `Academic Year ${schoolId}`,
    startingDate: "2026-09-14",
    endingDate: "2027-07-10",
    schoolId,
    status: "active"
  });
  await db.insert(smBaseGroups).values({ id: baseGroupId, name: "Gender", schoolId });
  await db.insert(smBaseSetups).values({
    id: genderId,
    baseSetupName: "Male",
    baseGroupId,
    schoolId
  });
  await db.insert(smDesignations).values({ id: designationId, title: "teacher", schoolId });
  await db.insert(smHumanDepartments).values({
    id: departmentId,
    name: "Academic",
    schoolId,
    createdBy: userId,
    updatedBy: userId
  });
  await db.insert(smStudentCategories).values({
    id: categoryId,
    categoryName: "LOWERBASIC",
    schoolId,
    academicId
  });
  await db.insert(smClasses).values({
    id: classId,
    className: options.className ?? `Class ${schoolId}`,
    schoolId,
    academicId,
    stage: "LOWER_BASIC",
    sortOrder: 1
  });
  await db.insert(smSections).values({
    id: sectionId,
    sectionName: "A",
    schoolId,
    academicId
  });
  await db.insert(smSubjects).values({
    id: subjectId,
    subjectName: "Mathematics",
    subjectType: "T",
    schoolId,
    academicId
  });
  await db.insert(smStaffs).values({
    id: staffId,
    firstName: "Staff",
    lastName: `${schoolId}`,
    fullName: `Staff ${schoolId}`,
    email: `staff${schoolId}@example.test`,
    schoolId,
    userId,
    roleId,
    designationId,
    departmentId,
    genderId
  });
  await db.insert(smParents).values({
    id: parentId,
    guardiansName: `Guardian ${schoolId}`,
    guardiansEmail: `parent${schoolId}@example.test`,
    userId,
    schoolId,
    academicId
  });
  await db.insert(smStudents).values({
    id: studentId,
    admissionNo: options.studentAdmissionNo ?? base + 14,
    rollNo: 1,
    firstName: "Student",
    lastName: `${schoolId}`,
    fullName: `Student ${schoolId}`,
    schoolId,
    academicId,
    classId,
    sectionId,
    parentId,
    userId,
    studentCategoryId: categoryId,
    genderId,
    bloodgroupId: null,
    religionId: null,
    routeListId: null,
    dormitoryId: null,
    vechileId: null,
    roomId: null,
    studentGroupId: null,
    status: "active"
  });
  await db.insert(studentRecords).values({
    id: recordId,
    classId,
    sectionId,
    schoolId,
    academicId,
    studentId,
    isDefault: 1,
    activeStatus: 1,
    status: options.studentRecordStatus ?? "current"
  });
  await db.insert(smExamTypes).values({
    id: termId,
    name: "FIRST TERM",
    sequence: 1,
    schoolId,
    academicId,
    status: "active",
    startsOn: "2026-09-14",
    endsOn: "2026-12-11"
  });
  await db.insert(smGeneralSettings).values({
    id: settingsId,
    schoolId,
    academicId,
    sessionId: academicId,
    languageId: null,
    dateFormatId: null,
    schoolName: `School ${schoolId}`,
    phone: `070000000${schoolId}`,
    email: `office${schoolId}@example.test`,
    address: `${schoolId} School Road`,
    identity: ""
  });

  return {
    schoolId,
    academicId,
    roleId,
    userId,
    baseGroupId,
    genderId,
    designationId,
    departmentId,
    categoryId,
    classId,
    sectionId,
    subjectId,
    termId,
    staffId,
    parentId,
    studentId,
    recordId,
    settingsId
  };
}

/** The standard two-tenant fixture used by every isolation test. */
export async function seedTwoSchools(
  db: RepositoryDb
): Promise<readonly [SeededSchool, SeededSchool]> {
  const first = await seedSchool(db, 1);
  const second = await seedSchool(db, 2);
  return [first, second];
}

/**
 * Builds an insert row that satisfies every FK without depending on the
 * school's optional reference rows (blood group, route, dormitory, ...).
 */
export function minimalStudentRow(
  school: SeededSchool,
  id: number,
  overrides: Partial<typeof smStudents.$inferInsert> = {}
): typeof smStudents.$inferInsert {
  return {
    id,
    admissionNo: id,
    rollNo: 1,
    firstName: "Bulk",
    lastName: `${id}`,
    fullName: `Bulk ${id}`,
    schoolId: school.schoolId,
    academicId: school.academicId,
    classId: school.classId,
    sectionId: school.sectionId,
    parentId: school.parentId,
    userId: school.userId,
    studentCategoryId: school.categoryId,
    genderId: school.genderId,
    bloodgroupId: null,
    religionId: null,
    routeListId: null,
    dormitoryId: null,
    vechileId: null,
    roomId: null,
    studentGroupId: null,
    status: "active",
    ...overrides
  };
}
