import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  batchUpsertMarkRecords,
  batchUpsertResultRecords,
  cleanMarks,
  deleteExamSetup,
  deleteMarkStore,
  deleteResultStore,
  ensureExam,
  getClassAverages,
  getMarkGrade,
  getMarksData,
  getTranscriptData,
  queryResultData,
  replaceMeritPositions,
  upsertExamSetup
} from "../../src/lib/server/repository";
import {
  examMeritPositions,
  smMarkStores,
  smMarksGrades,
  smResultStores
} from "../../src/lib/server/db/schema";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;
let examId: number;
let setupId: number;

const resultRow = (school: SeededSchool, id: number, totalMarks: number) => ({
  id,
  studentRollNo: 1,
  studentAddmissionNo: school.studentId,
  isAbsent: 0,
  totalMarks,
  totalGpaGrade: "A",
  examTypeId: school.termId,
  subjectId: school.subjectId,
  studentId: school.studentId,
  studentRecordId: school.recordId,
  classId: school.classId,
  sectionId: school.sectionId,
  schoolId: school.schoolId,
  academicId: school.academicId,
  activeStatus: 1
});

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));

  examId = await ensureExam(first, {
    classId: schools[0].classId,
    sectionId: schools[0].sectionId,
    subjectId: schools[0].subjectId,
    examTypeId: schools[0].termId
  });
  setupId = await upsertExamSetup(first, {
    examTitle: "CA1",
    examMark: 20,
    examId,
    examTermId: schools[0].termId,
    classId: schools[0].classId,
    sectionId: schools[0].sectionId,
    subjectId: schools[0].subjectId,
    activeStatus: 1
  });

  await db.insert(smMarksGrades).values([
    {
      id: 8_001,
      gradeName: "A",
      gpa: 4,
      percentFrom: 90,
      percentUpto: 100,
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId
    },
    {
      id: 8_002,
      gradeName: "B",
      gpa: 3,
      percentFrom: 80,
      percentUpto: 89,
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId
    }
  ]);
});

describe("marks stores", () => {
  it("replaces the submitted mark set atomically", async () => {
    await batchUpsertMarkRecords(first, [
      {
        id: 8_101,
        studentRollNo: 1,
        studentAddmissionNo: schools[0].studentId,
        totalMarks: 18,
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
      }
    ]);

    await batchUpsertMarkRecords(first, [
      {
        id: 8_102,
        studentRollNo: 1,
        studentAddmissionNo: schools[0].studentId,
        totalMarks: 19,
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
      }
    ]);

    const marks = await getMarksData(first, schools[0].studentId, schools[0].termId);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ totalMarks: 19, examTitle: "CA1" });
    await expect(getMarksData(second, schools[0].studentId, schools[0].termId)).resolves.toEqual(
      []
    );
  });

  it("deletes marks in chunks", async () => {
    const marks = await getMarksData(first, schools[0].studentId, schools[0].termId);
    const ids = marks.map((mark) => mark.markId);
    await deleteMarkStore(first, ids, schools[0].studentId);
    await expect(getMarksData(first, schools[0].studentId, schools[0].termId)).resolves.toEqual(
      []
    );
  });
});

describe("result stores", () => {
  it("replaces results and averages them per student", async () => {
    await batchUpsertResultRecords(first, [resultRow(schools[0], 8_201, 80)]);
    await batchUpsertResultRecords(first, [resultRow(schools[0], 8_202, 90)]);

    const rows = await db
      .select({ id: smResultStores.id, totalMarks: smResultStores.totalMarks })
      .from(smResultStores)
      .where(eq(smResultStores.academicId, schools[0].academicId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.totalMarks).toBe(90);

    await batchUpsertResultRecords(first, [
      resultRow(schools[0], 8_203, 70),
      resultRow(schools[0], 8_204, 90)
    ]);
    const averages = await getClassAverages(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      examId: schools[0].termId
    });
    expect(averages).toEqual([{ studentId: schools[0].studentId, average: 80 }]);
  });

  it("finds a grade band and deletes a single result", async () => {
    const grade = await getMarkGrade(first, 95);
    expect(grade).toEqual([{ gradeName: "A", gpa: 4 }]);

    await deleteResultStore(first, 8_203, schools[0].studentId);
    const rows = await db
      .select({ id: smResultStores.id })
      .from(smResultStores)
      .where(eq(smResultStores.academicId, schools[0].academicId));
    expect(rows).toHaveLength(1);
  });

  it("cleans marks and results for a term", async () => {
    await cleanMarks(first, {
      recordId: schools[0].recordId,
      studentId: schools[0].studentId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      examTermId: schools[0].termId
    });
    const marks = await db
      .select({ id: smMarkStores.id })
      .from(smMarkStores)
      .where(eq(smMarkStores.studentId, schools[0].studentId));
    expect(marks).toEqual([]);
  });
});

describe("merit and exam setup deletion", () => {
  it("replaces merit positions for a class section", async () => {
    const count = await replaceMeritPositions(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      examTermId: schools[0].termId,
      rows: [
        {
          classId: schools[0].classId,
          sectionId: schools[0].sectionId,
          examTermId: schools[0].termId,
          totalMark: 90,
          position: 1,
          admissionNo: 114,
          gpa: 4,
          grade: "A",
          recordId: schools[0].recordId,
          schoolId: schools[0].schoolId,
          academicId: schools[0].academicId
        }
      ]
    });
    expect(count).toBe(1);

    const rows = await db
      .select({ id: examMeritPositions.id })
      .from(examMeritPositions)
      .where(eq(examMeritPositions.schoolId, schools[0].schoolId));
    expect(rows).toHaveLength(1);
  });

  it("deletes exam setups in chunks", async () => {
    const disposableExam = await ensureExam(first, {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      examTypeId: schools[0].termId
    });
    const disposableSetup = await upsertExamSetup(first, {
      examTitle: "TEMP",
      examMark: 10,
      examId: disposableExam,
      examTermId: schools[0].termId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      subjectId: schools[0].subjectId,
      activeStatus: 1
    });

    await deleteExamSetup(first, [disposableSetup]);
    const rows = await db
      .select({ id: smMarkStores.id })
      .from(smMarkStores)
      .where(eq(smMarkStores.examSetupId, disposableSetup));
    expect(rows).toEqual([]);
  });
});

describe("result composition", () => {
  it("reads a term result view and transcript for the student", async () => {
    await batchUpsertResultRecords(first, [resultRow(schools[0], 8_301, 88)]);
    await batchUpsertMarkRecords(first, [
      {
        id: 8_401,
        studentRollNo: 1,
        studentAddmissionNo: schools[0].studentId,
        totalMarks: 17,
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
      }
    ]);

    const view = await queryResultData(first, schools[0].studentId, schools[0].termId);
    expect(view.examType).toMatchObject({ id: schools[0].termId, name: "FIRST TERM" });
    expect(view.resultRecords).toHaveLength(1);
    expect(view.marks).toHaveLength(1);
    expect(view.classResults).toHaveLength(1);

    const transcript = await getTranscriptData(first, schools[0].studentId, schools[0].academicId);
    expect(transcript.terms.map((term) => term.id)).toEqual([schools[0].termId]);
    expect(transcript.school?.schoolName).toBe("School 1");
    expect(transcript.records).toHaveLength(1);
    expect(transcript.classResults).toHaveLength(1);
  });

  it("keeps composed reads tenant-scoped", async () => {
    await expect(
      queryResultData(second, schools[0].studentId, schools[0].termId)
    ).resolves.toMatchObject({ examType: null, resultRecords: [] });
    await expect(
      getTranscriptData(second, schools[0].studentId, schools[0].academicId)
    ).resolves.toMatchObject({ terms: [], academicYear: null });
  });
});
