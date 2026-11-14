import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  smMarkStores,
  smResultStores,
  studentRatings,
  teacherRemarks
} from "../../src/lib/server/db/schema";
import {
  countAssessmentRawRows,
  countStudentAssessmentRows,
  purgeAssessmentRawRows,
  readAssessmentRawRows,
  restoreAssessmentRawRows
} from "../../src/lib/server/repository";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
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
  await db.insert(smMarkStores).values({
    id: 801,
    studentRollNo: 1,
    studentAddmissionNo: schools[0].studentId,
    totalMarks: 30,
    isAbsent: 0,
    subjectId: schools[0].subjectId,
    examTermId: schools[0].termId,
    studentId: schools[0].studentId,
    studentRecordId: schools[0].recordId,
    classId: schools[0].classId,
    sectionId: schools[0].sectionId,
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId
  });
  await db.insert(smResultStores).values({
    id: 802,
    studentRollNo: 1,
    studentAddmissionNo: schools[0].studentId,
    isAbsent: 0,
    totalMarks: 30,
    examTypeId: schools[0].termId,
    subjectId: schools[0].subjectId,
    studentId: schools[0].studentId,
    studentRecordId: schools[0].recordId,
    classId: schools[0].classId,
    sectionId: schools[0].sectionId,
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId
  });
  await db.insert(studentRatings).values({
    id: 803,
    rate: 4,
    attribute: "Punctuality",
    studentId: schools[0].studentId,
    examTypeId: schools[0].termId,
    academicId: schools[0].academicId
  });
  await db.insert(teacherRemarks).values({
    id: 804,
    remark: "Good progress",
    studentId: schools[0].studentId,
    examTypeId: schools[0].termId,
    academicId: schools[0].academicId
  });
});

describe("assessment archive raw rows", () => {
  it("reads one student's marks, results, ratings and remarks", async () => {
    const rows = await readAssessmentRawRows(first, {
      studentId: schools[0].studentId,
      academicId: schools[0].academicId
    });
    expect(rows.marks).toHaveLength(1);
    expect(rows.results).toHaveLength(1);
    expect(rows.ratings).toHaveLength(1);
    expect(rows.remarks).toHaveLength(1);
  });

  it("counts the session and the student", async () => {
    await expect(countAssessmentRawRows(first, schools[0].academicId)).resolves.toEqual({
      marks: 1,
      results: 1,
      ratings: 1,
      remarks: 1
    });
    await expect(
      countStudentAssessmentRows(first, {
        studentId: schools[0].studentId,
        academicId: schools[0].academicId
      })
    ).resolves.toEqual({ marks: 1, results: 1, ratings: 1, remarks: 1 });
  });

  it("purges and restores idempotently", async () => {
    const snapshot = await readAssessmentRawRows(first, {
      studentId: schools[0].studentId,
      academicId: schools[0].academicId
    });
    await expect(
      purgeAssessmentRawRows(first, schools[0].academicId)
    ).resolves.toEqual({ marks: 1, results: 1, ratings: 1, remarks: 1 });
    await expect(
      countAssessmentRawRows(first, schools[0].academicId)
    ).resolves.toEqual({ marks: 0, results: 0, ratings: 0, remarks: 0 });

    await restoreAssessmentRawRows(first, snapshot);
    await restoreAssessmentRawRows(first, snapshot);
    await expect(
      countAssessmentRawRows(first, schools[0].academicId)
    ).resolves.toEqual({ marks: 1, results: 1, ratings: 1, remarks: 1 });
  });

  it("keeps tenants isolated", async () => {
    await expect(
      readAssessmentRawRows(second, {
        studentId: schools[0].studentId,
        academicId: schools[0].academicId
      })
    ).resolves.toEqual({ marks: [], results: [], ratings: [], remarks: [] });
    await expect(
      countAssessmentRawRows(second, schools[0].academicId)
    ).resolves.toEqual({ marks: 0, results: 0, ratings: 0, remarks: 0 });
  });
});
