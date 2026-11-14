import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  ensureExam,
  findCurrentTerm,
  findExamSetup,
  findExamSetupsByClassSection,
  findExamSetupsByStaffId,
  findSubjectFullMark,
  listExamTypes,
  parseTermGrading,
  updateExamSetup,
  upsertExamSetup
} from "../../src/lib/server/repository";
import {
  smAssignSubjects,
  smExamSetups,
  smExamTypes,
  smMarkStores
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

  await db.insert(smExamTypes).values({
    id: 711,
    name: "SECOND TERM",
    sequence: 2,
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId,
    status: "active",
    startsOn: "2027-01-11",
    endsOn: "2027-04-02",
    legacySuffix: "APR/2027",
    grading: JSON.stringify({ isAverage: true, percentage: 40, averageMark: 75 })
  });
  await db.insert(smExamTypes).values({
    id: 712,
    name: "BROKEN TERM",
    sequence: 3,
    schoolId: schools[1].schoolId,
    academicId: schools[1].academicId,
    status: "planned",
    grading: "not-json"
  });
  await db.insert(smAssignSubjects).values({
    id: 9_201,
    teacherId: schools[0].staffId,
    classId: schools[0].classId,
    sectionId: schools[0].sectionId,
    subjectId: schools[0].subjectId,
    schoolId: schools[0].schoolId,
    academicId: schools[0].academicId,
    activeStatus: 1
  });
});

describe("terms and exams", () => {
  it("lists terms in sequence order and parses grading JSON", async () => {
    const terms = await listExamTypes(first);
    expect(terms.map((term) => term.sequence)).toEqual([1, 2]);
    expect(terms[1]).toMatchObject({
      name: "SECOND TERM",
      legacySuffix: "APR/2027",
      isAverage: true,
      percentage: 40,
      averageMark: 75
    });
  });

  it("degrades malformed grading JSON to nulls", async () => {
    expect(parseTermGrading("not-json")).toEqual({
      isAverage: false,
      percentage: null,
      averageMark: null
    });
    const terms = await listExamTypes(second);
    expect(terms[0]?.percentage).toBeNull();
  });

  it("returns the latest term by sequence and by explicit id", async () => {
    await expect(findCurrentTerm(first)).resolves.toMatchObject({ id: 711, sequence: 2 });
    await expect(findCurrentTerm(first, schools[0].termId)).resolves.toMatchObject({
      id: schools[0].termId
    });
    await expect(findCurrentTerm(first, 999_999)).resolves.toBeNull();
  });

  it("creates an exam once per natural key", async () => {
    const identity = {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      examTypeId: schools[0].termId
    };
    const id = await ensureExam(first, identity);
    await expect(ensureExam(first, identity)).resolves.toBe(id);
    await expect(ensureExam(first, { ...identity, examTypeId: 711 })).resolves.not.toBe(id);
  });

  it("keeps terms tenant-scoped", async () => {
    const other = await listExamTypes(second);
    expect(other.map((term) => term.id)).toEqual([216, 712]);
  });
});

describe("exam setups", () => {
  it("upserts a setup and reads it back by class section", async () => {
    const examId = await ensureExam(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      examTypeId: schools[0].termId
    });

    const id = await upsertExamSetup(first, {
      examTitle: "CA1",
      examMark: 20,
      examId,
      examTermId: schools[0].termId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      activeStatus: 1
    });

    const updated = await upsertExamSetup(first, {
      examTitle: "CA1",
      examMark: 30,
      examId,
      examTermId: schools[0].termId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      activeStatus: 1
    });
    expect(updated).toBe(id);

    const setups = await findExamSetupsByClassSection(
      first,
      schools[0].classId,
      schools[0].sectionId,
      schools[0].termId
    );
    expect(setups).toHaveLength(1);
    expect(setups[0]).toMatchObject({ id, examTitle: "CA1" });

    const detail = await findExamSetup(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      examTypeId: schools[0].termId
    });
    expect(detail[0]?.examMark).toBe(30);

    await expect(
      updateExamSetup(first, {
        classId: schools[0].classId,
        sectionId: schools[0].sectionId,
        examTermId: schools[0].termId,
        examTitle: "CA2"
      })
    ).resolves.toBe(1);
    await expect(
      findExamSetup(first, {
        classId: schools[0].classId,
        sectionId: schools[0].sectionId,
        examTypeId: schools[0].termId
      })
    ).resolves.toHaveLength(1);
    await expect(
      findExamSetup(second, {
        classId: schools[0].classId,
        sectionId: schools[0].sectionId,
        examTypeId: schools[0].termId
      })
    ).resolves.toEqual([]);
  });

  it("reads setups for a staff assignment and full marks for a subject", async () => {
    const examId = await ensureExam(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      examTypeId: 711
    });
    await upsertExamSetup(first, {
      examTitle: "EXAM",
      examMark: 60,
      examId,
      examTermId: 711,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      activeStatus: 1
    });

    const setups = await findExamSetupsByStaffId(first, schools[0].staffId);
    expect(setups[0]).toMatchObject({ classId: schools[0].classId });
    await expect(findExamSetupsByStaffId(first, schools[1].staffId)).resolves.toEqual([]);

    const setupId = setups[0]?.id ?? 0;
    await db.insert(smMarkStores).values({
      id: 9_301,
      studentRollNo: 1,
      studentAddmissionNo: 114,
      totalMarks: 100,
      isAbsent: 0,
      subjectId: schools[0].subjectId,
      examTermId: schools[0].termId,
      examSetupId: setupId,
      studentId: schools[0].studentId,
      studentRecordId: schools[0].recordId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId,
      activeStatus: 1
    });

    await expect(
      findSubjectFullMark(first, {
        examTypeId: schools[0].termId,
        subjectId: schools[0].subjectId,
        classId: schools[0].classId,
        sectionId: schools[0].sectionId
      })
    ).resolves.toBe(100);
    await expect(
      findSubjectFullMark(second, {
        examTypeId: schools[0].termId,
        subjectId: schools[0].subjectId,
        classId: schools[0].classId,
        sectionId: schools[0].sectionId
      })
    ).resolves.toBe(0);
  });

  it("has one setup row per term after the repeated upsert", async () => {
    const rows = await db.select({ id: smExamSetups.id }).from(smExamSetups);
    expect(rows).toHaveLength(2);
  });
});
