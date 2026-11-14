import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  findObjectives,
  findStudentRatings,
  findTeacherRemarks,
  upsertDaycareLearningOutcome,
  upsertStudentRatings,
  upsertTeacherRemark
} from "../../src/lib/server/repository";
import { smMarkStores, teacherRemarks } from "../../src/lib/server/db/schema";
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

describe("student ratings", () => {
  it("upserts one rating per attribute and reads it back", async () => {
    await upsertStudentRatings(first, [
      {
        studentId: schools[0].studentId,
        examTypeId: schools[0].termId,
        attribute: "Punctuality",
        rate: 3,
        color: "amber",
        remark: "Improving"
      }
    ]);
    await upsertStudentRatings(first, [
      {
        studentId: schools[0].studentId,
        examTypeId: schools[0].termId,
        attribute: "Punctuality",
        rate: 4,
        color: "green",
        remark: "Good"
      }
    ]);

    const ratings = await findStudentRatings(first, {
      studentId: schools[0].studentId,
      examTypeId: schools[0].termId
    });
    expect(ratings).toEqual([
      { attribute: "Punctuality", rate: 4, color: "green", remark: "Good" }
    ]);
    await expect(findStudentRatings(second, {})).resolves.toEqual([]);
  });
});

describe("teacher remarks", () => {
  it("upserts one remark per student and term", async () => {
    await upsertTeacherRemark(first, {
      studentId: schools[0].studentId,
      examTypeId: schools[0].termId,
      teacherId: schools[0].staffId,
      remark: "Needs practice"
    });
    await upsertTeacherRemark(first, {
      studentId: schools[0].studentId,
      examTypeId: schools[0].termId,
      teacherId: schools[0].staffId,
      remark: "Excellent progress"
    });

    const rows = await db
      .select()
      .from(teacherRemarks)
      .where(eq(teacherRemarks.studentId, schools[0].studentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.remark).toBe("Excellent progress");

    await expect(
      findTeacherRemarks(first, { studentId: schools[0].studentId })
    ).resolves.toEqual([{ remark: "Excellent progress" }]);
    await expect(findTeacherRemarks(second, {})).resolves.toEqual([]);
  });
});

describe("daycare outcomes", () => {
  it("creates then updates the mark-store remark", async () => {
    const id = await upsertDaycareLearningOutcome(first, {
      studentRollNo: 1,
      studentAddmissionNo: 114,
      totalMarks: 0,
      isAbsent: 0,
      teacherRemarks: "Settled",
      subjectId: schools[0].subjectId,
      examTermId: schools[0].termId,
      studentId: schools[0].studentId,
      studentRecordId: schools[0].recordId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      activeStatus: 1
    });
    expect(id).toBeGreaterThan(0);

    const updated = await upsertDaycareLearningOutcome(first, {
      studentRollNo: 1,
      studentAddmissionNo: 114,
      totalMarks: 0,
      isAbsent: 0,
      teacherRemarks: "Thriving",
      subjectId: schools[0].subjectId,
      examTermId: schools[0].termId,
      studentId: schools[0].studentId,
      studentRecordId: schools[0].recordId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      activeStatus: 1
    });
    expect(updated).toBe(id);

    const [row] = await db.select().from(smMarkStores).where(eq(smMarkStores.id, id ?? 0));
    expect(row).toMatchObject({
      teacherRemarks: "Thriving",
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId
    });
  });

  it("returns null for an incomplete natural key", async () => {
    await expect(
      upsertDaycareLearningOutcome(first, { totalMarks: 0, studentId: null })
    ).resolves.toBeNull();
  });
});

describe("objectives", () => {
  it("keeps the NURSERY guard and returns no target-model objectives", async () => {
    await expect(findObjectives(first, schools[0].studentId)).resolves.toEqual([]);
    await expect(findObjectives(second, schools[1].studentId)).resolves.toEqual([]);
  });
});
