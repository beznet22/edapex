import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  createStudentWithRecord,
  deleteStudent,
  findRollAndAdmission,
  findStudentById,
  updateStudent,
  updateStudentCategoryId,
  updateStudentPhoto,
  updateStudentStatus
} from "../../src/lib/server/repository";
import { smStudents, studentRecords } from "../../src/lib/server/db/schema";
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

describe("student profile", () => {
  it("reads a student and their roll/admission only from their tenant", async () => {
    await expect(findStudentById(first, schools[0].studentId)).resolves.toMatchObject({
      id: schools[0].studentId,
      fullName: "Student 1"
    });
    await expect(findStudentById(second, schools[0].studentId)).resolves.toBeNull();
    await expect(findRollAndAdmission(first, schools[0].studentId)).resolves.toEqual({
      rollNo: 1,
      admissionNo: 114
    });
  });

  it("updates profile fields, photo and category", async () => {
    await expect(
      updateStudent(first, schools[0].studentId, { firstName: "Ama", lastName: "Mensah" })
    ).resolves.toMatchObject({ firstName: "Ama", lastName: "Mensah" });

    await expect(updateStudentPhoto(first, schools[0].studentId, "ama.jpg")).resolves.toBe(true);
    await expect(
      updateStudentCategoryId(first, schools[0].studentId, schools[0].categoryId)
    ).resolves.toBe(true);

    const row = await findStudentById(first, schools[0].studentId);
    expect(row).toMatchObject({ studentPhoto: "ama.jpg", firstName: "Ama" });
  });

  it("creates the student and its default record, rejecting duplicate admission numbers", async () => {
    const created = await createStudentWithRecord(first, {
      admissionNo: 5_001,
      firstName: "New",
      lastName: "Student",
      email: "new.student@example.test",
      mobile: null,
      dateOfBirth: "2015-01-01",
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      genderId: schools[0].genderId,
      studentCategoryId: schools[0].categoryId,
      userId: schools[0].userId,
      parentId: schools[0].parentId
    });
    expect(created.student.admissionNo).toBe(5_001);
    expect(created.student.currentRecordId).toBe(created.recordId);

    const records = await db
      .select()
      .from(studentRecords)
      .where(eq(studentRecords.studentId, created.student.id));
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe("current");

    await expect(
      createStudentWithRecord(first, {
        admissionNo: 5_001,
        firstName: "Duplicate",
        lastName: "Student",
        email: null,
        mobile: null,
        dateOfBirth: null,
        classId: schools[0].classId,
        sectionId: schools[0].sectionId,
        genderId: schools[0].genderId,
        studentCategoryId: schools[0].categoryId,
        userId: schools[0].userId,
        parentId: null
      })
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("toggles the student and all placement records together", async () => {
    await expect(
      updateStudentStatus(first, schools[0].studentId, false)
    ).resolves.toMatchObject({ success: true, active: false });

    const [student] = await db
      .select({ activeStatus: smStudents.activeStatus })
      .from(smStudents)
      .where(eq(smStudents.id, schools[0].studentId));
    expect(student?.activeStatus).toBe(0);

    const records = await db
      .select({ activeStatus: studentRecords.activeStatus })
      .from(studentRecords)
      .where(eq(studentRecords.studentId, schools[0].studentId));
    expect(records.every((record) => record.activeStatus === 0)).toBe(true);

    await updateStudentStatus(first, schools[0].studentId, true);
  });

  it("deletes records and the student without deleting the user", async () => {
    const created = await createStudentWithRecord(first, {
      admissionNo: 5_002,
      firstName: "To",
      lastName: "Delete",
      email: null,
      mobile: null,
      dateOfBirth: null,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      genderId: schools[0].genderId,
      studentCategoryId: schools[0].categoryId,
      userId: schools[0].userId,
      parentId: null
    });

    await expect(deleteStudent(first, created.student.id)).resolves.toMatchObject({
      success: true
    });
    const remaining = await db
      .select({ id: smStudents.id })
      .from(smStudents)
      .where(
        and(
          eq(smStudents.id, created.student.id),
          eq(smStudents.schoolId, schools[0].schoolId)
        )
      );
    expect(remaining).toEqual([]);
  });
});
