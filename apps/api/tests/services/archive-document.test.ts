import { describe, expect, it } from "vitest";

import {
  ARCHIVE_SCHEMA_VERSION,
  archiveDocumentSchema,
  archiveManifestSchema
} from "../../src/lib/schema/archive";
import type { ArchiveDocument } from "../../src/lib/schema/archive";
import type { Marksheet } from "../../src/lib/schema/marksheet";
import type { Transcript } from "../../src/lib/schema/transcript";

const school = {
  id: 1,
  name: "School 1",
  email: "office@example.test",
  phone: "0700000001",
  city: "City",
  state: "State",
  title: "FIRST TERM",
  vacation_date: "December 19, 2025"
};

const student = {
  id: 1,
  examTypeId: 5,
  fullName: "Student 1",
  gender: "Male",
  parentEmail: "parent@example.test",
  parentName: "Guardian 1",
  term: "FIRST TERM",
  title: "Termly Report",
  category: "LOWERBASIC" as const,
  className: "CLASS 1",
  sectionName: "A",
  adminNo: 14,
  sessionYear: "2025/2026",
  daysOpened: 60,
  daysAbsent: 2,
  daysPresent: 58,
  token: ""
};

const marksheet: Marksheet = {
  school,
  student,
  subjects: [{ subjectId: 3, subjectCode: "MTH", teacherId: null }],
  records: [
    {
      studentId: 1,
      resultId: 7,
      subjectId: 3,
      subject: "Mathematics",
      subjectCode: "MTH",
      objectives: null,
      titleIds: [],
      titles: ["MTA"],
      markIds: [9],
      marks: [30],
      absent: [false],
      fullMarks: [30],
      totalScore: 30,
      grade: "E",
      color: "bg-red-200",
      category: "LOWERBASIC"
    }
  ],
  score: {
    total: 30,
    average: 30,
    classAverage: {
      min: { studentId: 1, value: "30" },
      max: { studentId: 1, value: "30" }
    },
    maxScores: 100
  },
  ratings: [],
  remark: { remark: null }
};

const transcript: Transcript = {
  school,
  student,
  academicYear: { id: 1, title: "Academic Year 1", year: "2025/2026" },
  terms: [{ examTypeId: 5, title: "FIRST TERM", isAverage: false }],
  subjects: [
    {
      subjectId: 3,
      subject: "Mathematics",
      subjectCode: "MTH",
      marks: [30],
      total: 30,
      percentage: 30,
      grade: "E",
      color: "bg-red-200"
    }
  ],
  classAverage: 30,
  studentAverage: 30,
  yearlyTotal: 30,
  yearlyAverage: 30,
  maxPossibleTotal: 100
};

const document: ArchiveDocument = {
  schemaVersion: ARCHIVE_SCHEMA_VERSION,
  meta: {
    schoolId: 1,
    sessionId: 1,
    studentId: 1,
    studentRecordId: 10,
    archivedAt: "2026-09-01T10:00:00Z"
  },
  placement: {
    academicId: 1,
    sessionLabel: "2025/2026",
    classId: 2,
    className: "CLASS 1",
    sectionId: 3,
    sectionName: "A"
  },
  terms: {
    "5": {
      id: 5,
      sequence: 1,
      name: "FIRST TERM",
      display: "FIRST TERM EXAMINATION — DEC/2025",
      startsOn: "2025-09-15",
      endsOn: "2025-12-19"
    }
  },
  marksheets: { "5": marksheet },
  transcript,
  photoKey: null,
  raw: {
    marks: [
      {
        id: 9,
        studentRollNo: 1,
        studentAddmissionNo: 14,
        totalMarks: 30,
        isAbsent: 0,
        teacherRemarks: null,
        createdAt: 1700000000,
        updatedAt: null,
        subjectId: 3,
        examTermId: 5,
        examSetupId: 4,
        studentId: 1,
        studentRecordId: 10,
        classId: 2,
        sectionId: 3,
        createdBy: 1,
        updatedBy: 1,
        schoolId: 1,
        academicId: 1,
        activeStatus: 1
      }
    ],
    results: [
      {
        id: 7,
        studentRollNo: 1,
        studentAddmissionNo: 14,
        isAbsent: 0,
        totalMarks: 30,
        totalGpaPoint: 3,
        totalGpaGrade: "E",
        teacherRemarks: null,
        createdAt: 1700000000,
        updatedAt: null,
        examTypeId: 5,
        subjectId: 3,
        activeStatus: 1,
        examSetupId: 4,
        studentId: 1,
        studentRecordId: 10,
        classId: 2,
        sectionId: 3,
        createdBy: 1,
        updatedBy: 1,
        schoolId: 1,
        academicId: 1
      }
    ],
    ratings: [
      {
        id: 2,
        rate: 4,
        attribute: "Punctuality",
        color: "bg-blue-200",
        remark: null,
        createdAt: 1700000000,
        updatedAt: null,
        studentId: 1,
        examTypeId: 5,
        academicId: 1
      }
    ],
    remarks: [
      {
        id: 3,
        remark: "Good progress",
        createdAt: 1700000000,
        updatedAt: null,
        teacherId: 12,
        studentId: 1,
        examTypeId: 5,
        academicId: 1
      }
    ],
    studentAttendance: [
      {
        id: 4,
        attendanceType: "present",
        notes: null,
        attendanceDate: "2025-10-01",
        createdAt: 1700000000,
        updatedAt: null,
        studentId: 1,
        recordId: 10,
        studentRecordId: 10,
        classId: 2,
        sectionId: 3,
        createdBy: 1,
        updatedBy: 1,
        schoolId: 1,
        academicId: 1,
        activeStatus: 1
      }
    ],
    classAttendance: [
      {
        id: 5,
        daysOpened: 60,
        daysAbsent: 2,
        daysPresent: 58,
        createdAt: 1700000000,
        updatedAt: null,
        examTypeId: 5,
        studentId: 1,
        schoolId: 1,
        academicId: 1
      }
    ],
    summaries: [
      {
        id: 6,
        schoolId: 1,
        academicId: 1,
        studentId: 1,
        termId: 5,
        sequence: 1,
        total: 30,
        average: 30,
        grade: "E",
        gpa: 3,
        position: 1,
        subjectCount: 1,
        createdAt: 1700000000
      }
    ]
  }
};

describe("archive document schema", () => {
  it("parses a complete document and survives a JSON round-trip", async () => {
    const parsed = await archiveDocumentSchema.parseAsync(document);
    const roundTripped = await archiveDocumentSchema.parseAsync(
      JSON.parse(JSON.stringify(parsed))
    );
    expect(roundTripped).toEqual(parsed);
  });

  it("refuses an unknown schema version instead of guessing", async () => {
    await expect(
      archiveDocumentSchema.parseAsync({ ...document, schemaVersion: 2 })
    ).rejects.toThrow();
  });

  it("accepts a missing absent array for older objects", async () => {
    const record = marksheet.records[0];
    expect(record).toBeDefined();
    const { absent: _absent, ...withoutAbsent } = record ?? {};
    const parsed = await archiveDocumentSchema.parseAsync({
      ...document,
      marksheets: {
        "5": {
          ...marksheet,
          records: [withoutAbsent]
        }
      }
    });
    const parsedRecord = parsed.marksheets["5"]?.records[0];
    expect(parsedRecord?.absent).toBeUndefined();
  });

  it("rejects absence flags that do not line up with marks", async () => {
    const record = marksheet.records[0];
    expect(record).toBeDefined();
    await expect(
      archiveDocumentSchema.parseAsync({
        ...document,
        marksheets: {
          "5": {
            ...marksheet,
            records: [{ ...record, absent: [true, false] }]
          }
        }
      })
    ).rejects.toThrow();
  });
});

describe("archive manifest schema", () => {
  it("parses coverage, checksums and gaps", () => {
    const manifest = archiveManifestSchema.parse({
      schemaVersion: 1,
      schoolId: 1,
      sessionId: 1,
      generatedAt: 1790000000,
      students: { total: 2, archived: 1, quarantined: 1, missing: [] },
      terms: [5],
      objects: [
        {
          studentId: 1,
          key: "schools/1/sessions/1/students/1/v1.json",
          checksum: "abc",
          bytes: 1200,
          version: 1,
          status: "archived"
        }
      ],
      gaps: [{ studentId: 2, reason: "checksum_mismatch" }]
    });
    expect(manifest.objects).toHaveLength(1);
    expect(manifest.gaps[0]?.reason).toBe("checksum_mismatch");
  });
});
