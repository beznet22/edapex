import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { classAttendances, smStudentAttendances } from "../../src/lib/server/db/schema";
import {
  countClassAttendanceForSession,
  countClassAttendanceForStudent,
  countStudentAttendanceForSession,
  countStudentAttendanceForStudent,
  purgeClassAttendanceForSession,
  purgeStudentAttendanceForSession,
  readClassAttendanceForStudent,
  readStudentAttendance,
  restoreClassAttendance,
  restoreStudentAttendance
} from "../../src/lib/server/repository";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

const attendanceRow = (school: SeededSchool, id: number) => ({
  id,
  attendanceType: "present",
  attendanceDate: "2025-10-01",
  studentId: school.studentId,
  studentRecordId: school.recordId,
  classId: school.classId,
  sectionId: school.sectionId,
  createdBy: school.userId,
  updatedBy: school.userId,
  schoolId: school.schoolId,
  academicId: school.academicId,
  activeStatus: 1,
  createdAt: 1_790_000_000
});

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
  await db
    .insert(smStudentAttendances)
    .values([901, 902, 903].map((id) => attendanceRow(schools[0], id)));
  await db.insert(classAttendances).values({
    id: 910,
    daysOpened: 60,
    daysAbsent: 2,
    daysPresent: 58,
    examTypeId: schools[0].termId,
    studentId: schools[0].studentId,
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId
  });
});

describe("student attendance archive rows", () => {
  it("reads and counts one student's attendance", async () => {
    const rows = await readStudentAttendance(first, {
      studentId: schools[0].studentId,
      academicId: schools[0].academicId
    });
    expect(rows).toHaveLength(3);
    await expect(
      countStudentAttendanceForStudent(first, {
        studentId: schools[0].studentId,
        academicId: schools[0].academicId
      })
    ).resolves.toBe(3);
    await expect(
      countStudentAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(3);
  });

  it("purges and restores without duplicating rows", async () => {
    const snapshot = await readStudentAttendance(first, {
      studentId: schools[0].studentId,
      academicId: schools[0].academicId
    });
    await expect(
      purgeStudentAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(3);
    await expect(
      countStudentAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(0);

    await restoreStudentAttendance(first, snapshot);
    await restoreStudentAttendance(first, snapshot);
    await expect(
      countStudentAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(3);
  });

  it("handles the per-term class attendance summary", async () => {
    const rows = await readClassAttendanceForStudent(first, {
      studentId: schools[0].studentId,
      academicId: schools[0].academicId
    });
    expect(rows).toHaveLength(1);
    await expect(
      countClassAttendanceForStudent(first, {
        studentId: schools[0].studentId,
        academicId: schools[0].academicId
      })
    ).resolves.toBe(1);
    await expect(
      purgeClassAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(1);
    await expect(
      countClassAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(0);
    await restoreClassAttendance(first, rows);
    await restoreClassAttendance(first, rows);
    await expect(
      countClassAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(1);
  });

  it("keeps tenants isolated", async () => {
    await expect(
      readStudentAttendance(second, {
        studentId: schools[0].studentId,
        academicId: schools[0].academicId
      })
    ).resolves.toEqual([]);
    await expect(
      countClassAttendanceForSession(second, schools[0].academicId)
    ).resolves.toBe(0);
  });
});
