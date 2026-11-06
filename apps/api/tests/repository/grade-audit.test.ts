import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { smResultStores } from "../../src/lib/server/db/schema";
import {
  findResultById,
  insertGradeAudit,
  listGradeAuditForResult,
  overrideResultAndMark
} from "../../src/lib/server/repository";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const RESULT_ID = 701;
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
  await db.insert(smResultStores).values({
    id: RESULT_ID,
    studentRollNo: 1,
    studentAddmissionNo: schools[0].studentId,
    isAbsent: 0,
    totalMarks: 80,
    totalGpaPoint: 4,
    totalGpaGrade: "B",
    examTypeId: schools[0].termId,
    subjectId: schools[0].subjectId,
    studentId: schools[0].studentId,
    studentRecordId: schools[0].recordId,
    classId: schools[0].classId,
    sectionId: schools[0].sectionId,
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId
  });
});

describe("grade change audit repository", () => {
  it("records before/after and lists the result's history", async () => {
    await insertGradeAudit(first, {
      schoolId: schools[0].schoolId,
      resultId: RESULT_ID,
      studentId: schools[0].studentId,
      academicId: schools[0].academicId,
      examTypeId: schools[0].termId,
      subjectId: schools[0].subjectId,
      actorId: schools[0].userId,
      beforeJson: JSON.stringify({ totalMarks: 80 }),
      afterJson: JSON.stringify({ totalMarks: 90 }),
      reason: "Arithmetic correction",
      createdAt: 1_790_000_000
    });

    const rows = await listGradeAuditForResult(first, RESULT_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reason: "Arithmetic correction",
      beforeJson: JSON.stringify({ totalMarks: 80 }),
      afterJson: JSON.stringify({ totalMarks: 90 })
    });
  });

  it("overrides the result row and leaves a readable audit trail", async () => {
    const before = await findResultById(first, RESULT_ID);
    expect(before).toMatchObject({ totalMarks: 80 });

    await overrideResultAndMark(first, {
      resultId: RESULT_ID,
      studentId: schools[0].studentId,
      academicId: schools[0].academicId,
      examSetupId: null,
      totalMarks: 91,
      totalGpaPoint: 4,
      totalGpaGrade: "A",
      isAbsent: 0,
      teacherRemarks: "Corrected",
      updatedBy: schools[0].userId
    });

    await expect(findResultById(first, RESULT_ID)).resolves.toMatchObject({
      totalMarks: 91,
      totalGpaGrade: "A",
      teacherRemarks: "Corrected"
    });
  });

  it("keeps tenants isolated", async () => {
    await expect(findResultById(second, RESULT_ID)).resolves.toBeNull();
    await expect(listGradeAuditForResult(second, RESULT_ID)).resolves.toEqual([]);
  });
});
