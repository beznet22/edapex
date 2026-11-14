import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  demoteStudent,
  findLatestPromotion,
  findNextRollNo,
  promoteStudent
} from "../../src/lib/server/repository";
import {
  smClasses,
  smSections,
  smStudentPromotions,
  smStudents,
  studentRecords
} from "../../src/lib/server/db/schema";
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

  await db.insert(smClasses).values({
    id: 630,
    className: "CLASS 10",
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId,
    stage: "UPPER_BASIC",
    sortOrder: 10
  });
  await db.insert(smSections).values({
    id: 640,
    sectionName: "B",
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId
  });
});

describe("student lifecycle", () => {
  it("promotes a student and writes the audit trail", async () => {
    await expect(
      findNextRollNo(first, 630, 640, schools[0].academicId)
    ).resolves.toBe(1);

    const promoted = await promoteStudent(first, {
      studentId: schools[0].studentId,
      classId: 630,
      sectionId: 640,
      resultStatus: "PASSED"
    });
    expect(promoted.success).toBe(true);
    expect(promoted.rollNo).toBe(1);

    const [student] = await db
      .select()
      .from(smStudents)
      .where(eq(smStudents.id, schools[0].studentId));
    expect(student).toMatchObject({
      classId: 630,
      sectionId: 640,
      rollNo: 1,
      currentRecordId: promoted.recordId
    });

    const [oldRecord] = await db
      .select()
      .from(studentRecords)
      .where(eq(studentRecords.id, schools[0].recordId));
    expect(oldRecord).toMatchObject({ isDefault: 0, status: "promoted" });

    const latest = await findLatestPromotion(first, schools[0].studentId);
    expect(latest).toMatchObject({
      id: promoted.promotionId,
      previousClassId: schools[0].classId,
      currentClassId: 630
    });
  });

  it("reverts the promotion atomically", async () => {
    const latest = await findLatestPromotion(first, schools[0].studentId);
    if (latest?.id === undefined || latest.currentClassId === null) {
      throw new Error("fixture promotion missing");
    }

    await expect(
      demoteStudent(first, {
        studentId: schools[0].studentId,
        promotionId: latest.id,
        currentClassId: 630,
        currentSectionId: 640,
        currentAcademicId: schools[0].academicId,
        previousClassId: schools[0].classId,
        previousSectionId: schools[0].sectionId,
        previousAcademicId: schools[0].academicId,
        previousRollNumber: 1
      })
    ).resolves.toMatchObject({ success: true, previousClassId: schools[0].classId });

    const [student] = await db
      .select()
      .from(smStudents)
      .where(eq(smStudents.id, schools[0].studentId));
    expect(student).toMatchObject({
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      currentRecordId: schools[0].recordId
    });

    const [restored] = await db
      .select()
      .from(studentRecords)
      .where(eq(studentRecords.id, schools[0].recordId));
    expect(restored).toMatchObject({ isDefault: 1, status: "current" });

    const promotions = await db
      .select({ id: smStudentPromotions.id })
      .from(smStudentPromotions)
      .where(
        and(
          eq(smStudentPromotions.studentId, schools[0].studentId),
          eq(smStudentPromotions.schoolId, schools[0].schoolId)
        )
      );
    expect(promotions).toEqual([]);
  });

  it("rejects a student from another tenant", async () => {
    await expect(
      promoteStudent(first, {
        studentId: schools[1].studentId,
        classId: 630,
        sectionId: 640
      })
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });

    await expect(findLatestPromotion(second, schools[0].studentId)).resolves.toBeNull();
  });
});
