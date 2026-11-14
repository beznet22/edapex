import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { smAssignSubjects } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import {
  AssessmentEntryService,
  AssessmentQueryService,
  AssessmentRosterQueryService
} from "../../src/lib/server/services/assessment";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let school: SeededSchool;
let query: AssessmentQueryService;
let roster: AssessmentRosterQueryService;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  school = schools[0];
  await db.insert(smAssignSubjects).values({
    classId: school.classId,
    sectionId: school.sectionId,
    subjectId: school.subjectId,
    teacherId: school.staffId,
    schoolId: school.schoolId,
    academicId: school.academicId,
    activeStatus: 1
  });

  const ctx = createServiceContext({ DB: env.DB }, tenantOf(school));
  const entry = createService(AssessmentEntryService, ctx);
  await entry.upsertStudentResult(
    {
      studentData: {
        studentId: school.studentId,
        classId: school.classId,
        sectionId: school.sectionId,
        recordId: school.recordId,
        examTypeId: school.termId,
        studentCategory: "NURSERY"
      },
      marksData: [{ subjectId: school.subjectId, marks: { CA: 30, EXAM: 50 } }]
    },
    school.staffId
  );

  query = createService(AssessmentQueryService, ctx);
  roster = createService(AssessmentRosterQueryService, ctx);
});

describe("assessment query service", () => {
  it("returns a complete marksheet, including the assigned subjects", async () => {
    const result = await query.getStudentResult({ id: school.studentId, examId: school.termId });

    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.student.id).toBe(school.studentId);
    expect(result.student.category).toBe("LOWERBASIC");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.titles).toEqual(["CA", "EXAM"]);
    expect(result.records[0]?.marks).toEqual([30, 50]);
    expect(result.score?.total).toBe(80);
    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0]?.subjectId).toBe(school.subjectId);
  });

  it("returns transcript totals across the active term", async () => {
    const transcript = await query.getTranscript({
      studentId: school.studentId,
      academicId: school.academicId
    });

    expect(transcript).not.toBeNull();
    if (transcript === null) return;
    expect(transcript.terms).toHaveLength(1);
    expect(transcript.subjects).toHaveLength(1);
    expect(transcript.subjects[0]?.marks).toEqual([80]);
    expect(transcript.yearlyTotal).toBe(80);
    expect(transcript.maxPossibleTotal).toBe(100);
  });

  it("keeps the NURSERY objectives guard", async () => {
    await expect(query.getObjectives(school.studentId, "NURSERY")).resolves.toEqual([]);
    await expect(query.getObjectives(school.studentId, "LOWERBASIC")).resolves.toEqual([]);
  });

  it("returns mapping data for the class and term", async () => {
    const mapping = await roster.getMappingData(school.classId, school.sectionId);

    expect(mapping.examTypes).toHaveLength(1);
    expect(mapping.studentCategories.length).toBeGreaterThanOrEqual(1);
    expect(mapping.subjects).toHaveLength(1);
    expect(mapping.examSetups).toHaveLength(2);
    expect(mapping.studentData).toEqual({});
  });

  it("returns null for an unknown student", async () => {
    await expect(
      query.getStudentResult({ id: 999999, examId: school.termId })
    ).resolves.toBeNull();
  });
});
