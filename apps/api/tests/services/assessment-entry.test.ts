import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  classAttendances,
  smExamSetups,
  smExams,
  smMarkStores,
  smResultStores,
  smStudentTimelines,
  studentRatings,
  teacherRemarks
} from "../../src/lib/server/db/schema";
import type { Marksheet } from "../../src/lib/schema/marksheet";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { AssessmentEntryService } from "../../src/lib/server/services/assessment";
import { ValidationError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let school: SeededSchool;
let service: AssessmentEntryService;

const marksheet = (seeded: SeededSchool): Marksheet => ({
  school: {
    id: seeded.schoolId,
    name: `School ${seeded.schoolId}`,
    email: `office${seeded.schoolId}@example.test`,
    phone: "0700000000",
    city: "",
    state: "",
    title: "",
    vacation_date: ""
  },
  student: {
    id: seeded.studentId,
    examTypeId: seeded.termId,
    fullName: `Student ${seeded.schoolId}`,
    gender: "",
    parentEmail: "",
    parentName: "",
    term: "FIRST TERM",
    title: "FIRST TERM",
    category: "NURSERY",
    className: `CLASS ${seeded.schoolId}`,
    sectionName: "A",
    adminNo: seeded.studentId,
    sessionYear: `2026/${seeded.schoolId}`,
    daysOpened: 126,
    daysAbsent: 0,
    daysPresent: 126,
    token: `token-${seeded.studentId}`
  },
  subjects: [{ subjectId: seeded.subjectId, subjectCode: "MATH", teacherId: null }],
  records: [
    {
      studentId: seeded.studentId,
      resultId: 0,
      subjectId: seeded.subjectId,
      subject: "Mathematics",
      subjectCode: "MATH",
      objectives: null,
      titleIds: [],
      titles: ["CA", "EXAM"],
      markIds: [],
      marks: [30, 50],
      fullMarks: [30, 50],
      grade: "",
      category: "NURSERY",
      learningOutcome: null
    }
  ],
  ratings: [],
  remark: { remark: "Good progress" },
  examType: { id: seeded.termId, title: "FIRST TERM" },
  recordId: null
});

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  school = schools[0];
  service = createService(
    AssessmentEntryService,
    createServiceContext({ DB: env.DB }, tenantOf(school))
  );
});

describe("assessment entry service", () => {
  it("writes marks, results, exams and exam setups through named marks", async () => {
    const response = await service.upsertStudentResult(
      {
        studentData: {
          studentId: school.studentId,
          classId: school.classId,
          sectionId: school.sectionId,
          recordId: school.recordId,
          examTypeId: school.termId,
          studentCategory: "NURSERY"
        },
        marksData: [
          {
            subjectId: school.subjectId,
            marks: { CA: 30, EXAM: 50 }
          }
        ]
      },
      school.staffId
    );

    expect(response.results[0]).toMatchObject({ totalMarks: 80, percentage: 100, grade: "EXCEEDING" });

    const marks = await db
      .select()
      .from(smMarkStores)
      .where(eq(smMarkStores.schoolId, school.schoolId));
    const results = await db
      .select()
      .from(smResultStores)
      .where(eq(smResultStores.schoolId, school.schoolId));
    const exams = await db.select().from(smExams).where(eq(smExams.schoolId, school.schoolId));
    const setups = await db
      .select()
      .from(smExamSetups)
      .where(eq(smExamSetups.schoolId, school.schoolId));

    expect(marks).toHaveLength(2);
    expect(results).toHaveLength(1);
    expect(results[0]?.totalMarks).toBe(80);
    expect(exams).toHaveLength(1);
    expect(setups).toHaveLength(2);
  });

  it("replaces the prior set on a second write", async () => {
    await service.upsertStudentResult(
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

    const marks = await db
      .select()
      .from(smMarkStores)
      .where(eq(smMarkStores.schoolId, school.schoolId));
    const results = await db
      .select()
      .from(smResultStores)
      .where(eq(smResultStores.schoolId, school.schoolId));
    expect(marks).toHaveLength(2);
    expect(results).toHaveLength(1);
  });

  it("rejects an out-of-range mark before writing", async () => {
    await expect(
      service.upsertStudentResult(
        {
          studentData: {
            studentId: school.studentId,
            classId: school.classId,
            sectionId: school.sectionId,
            examTypeId: school.termId,
            studentCategory: "NURSERY"
          },
          marksData: [{ subjectId: school.subjectId, marks: { CA: 31, EXAM: 50 } }]
        },
        school.staffId
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("persists ratings, the teacher remark and attendance", async () => {
    await service.upsertStudentResult(
      {
        studentData: {
          studentId: school.studentId,
          classId: school.classId,
          sectionId: school.sectionId,
          examTypeId: school.termId,
          studentCategory: "NURSERY",
          attendance: { daysOpened: 126, daysAbsent: 0, daysPresent: 126 }
        },
        marksData: [{ subjectId: school.subjectId, marks: { CA: 30, EXAM: 50 } }],
        teachersRemark: { comment: "Excellent work" },
        studentRatings: { Neatness: 4, Meticulous: 5 }
      },
      school.staffId
    );

    const remarks = await db
      .select()
      .from(teacherRemarks)
      .where(eq(teacherRemarks.studentId, school.studentId));
    const ratings = await db
      .select()
      .from(studentRatings)
      .where(eq(studentRatings.studentId, school.studentId));
    const attendance = await db
      .select()
      .from(classAttendances)
      .where(eq(classAttendances.studentId, school.studentId));

    expect(remarks[0]?.remark).toBe("Excellent work");
    expect(ratings.map((rating) => rating.attribute).sort()).toEqual(["Meticulous", "Neatness"]);
    expect(attendance[0]).toMatchObject({ daysOpened: 126, daysPresent: 126, daysAbsent: 0 });
  });

  it("persists a fully validated marksheet and its timeline", async () => {
    const result = await service.upsertMarksheet(marksheet(school), school.staffId);

    expect(result.recordId).toBe(school.recordId);
    const marks = await db
      .select()
      .from(smMarkStores)
      .where(
        and(
          eq(smMarkStores.studentId, school.studentId),
          eq(smMarkStores.examTermId, school.termId)
        )
      );
    const timelines = await db
      .select()
      .from(smStudentTimelines)
      .where(eq(smStudentTimelines.staffStudentId, school.studentId));

    expect(marks).toHaveLength(2);
    expect(timelines.some((timeline) => timeline.type === `exam-${school.termId}`)).toBe(true);
  });

  it("rejects a marksheet with a subject record mismatch", async () => {
    const invalid = {
      ...marksheet(school),
      subjects: [
        { subjectId: school.subjectId, subjectCode: "MATH", teacherId: null },
        { subjectId: school.subjectId + 1, subjectCode: "ENG", teacherId: null }
      ]
    };

    await expect(service.upsertMarksheet(invalid, school.staffId)).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});
