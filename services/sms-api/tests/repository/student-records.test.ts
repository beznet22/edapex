import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  assignClassSection,
  createIfNotExistsStudentRecord,
  findStudentRecord,
  findStudentRecordByAdmissionNo
} from "../../src/lib/server/repository";
import { smClasses, smSections, smStudents, studentRecords } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));

  await db.insert(smClasses).values({
    id: 610,
    className: "CLASS 10",
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId,
    stage: "UPPER_BASIC",
    sortOrder: 10
  });
  await db.insert(smSections).values({
    id: 620,
    sectionName: "B",
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId
  });
});

describe("student records", () => {
  it("finds the default record by placement and by admission number", async () => {
    await expect(
      findStudentRecord(first, {
        classId: schools[0].classId,
        sectionId: schools[0].sectionId,
        studentId: schools[0].studentId
      })
    ).resolves.toMatchObject({
      id: schools[0].recordId,
      admissionNo: 114,
      fullName: "Student 1"
    });

    await expect(findStudentRecordByAdmissionNo(first, 114)).resolves.toMatchObject({
      recordId: schools[0].recordId,
      classId: schools[0].classId
    });
    await expect(findStudentRecordByAdmissionNo(first, 999_999)).resolves.toBeNull();
  });

  it("returns the existing record instead of duplicating it", async () => {
    const existing = await createIfNotExistsStudentRecord(first, {
      studentId: schools[0].studentId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId
    });
    expect(existing).toBe(schools[0].recordId);

    const created = await createIfNotExistsStudentRecord(first, {
      studentId: schools[0].studentId,
      classId: 610,
      sectionId: 620
    });
    expect(created).toBeGreaterThan(0);
  });

  it("moves the default placement and mirrors it on the student", async () => {
    await expect(
      assignClassSection(first, {
        studentId: schools[0].studentId,
        classId: 610,
        sectionId: 620
      })
    ).resolves.toBe(true);

    const [record] = await db
      .select()
      .from(studentRecords)
      .where(eq(studentRecords.id, schools[0].recordId));
    expect(record).toMatchObject({ classId: 610, sectionId: 620, isDefault: 1 });

    const [student] = await db
      .select({ classId: smStudents.classId, sectionId: smStudents.sectionId })
      .from(smStudents)
      .where(eq(smStudents.id, schools[0].studentId));
    expect(student).toEqual({ classId: 610, sectionId: 620 });
  });

  it("rejects a record lookup for another tenant", async () => {
    await expect(
      findStudentRecord(first, {
        classId: schools[1].classId,
        sectionId: schools[1].sectionId,
        studentId: schools[1].studentId
      })
    ).resolves.toBeNull();
  });
});
