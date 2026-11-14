import type { RepositoryDb } from "../../src/lib/server/repository/base/repository-context";
import {
  classAttendances,
  smAssignSubjects,
  smMarkStores,
  smResultStores,
  smStudentAttendances,
  studentRatings,
  teacherRemarks
} from "../../src/lib/server/db/schema";
import type { ArchiveDocument } from "../../src/lib/schema/archive";
import type { SeededSchool } from "./seed";

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

/** Minimal valid document for encoder/decoder tests; services build real ones. */
export function minimalArchiveDocument(): ArchiveDocument {
  return {
    schemaVersion: 1,
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
    marksheets: {
      "5": {
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
      }
    },
    transcript: {
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
    },
    photoKey: null,
    raw: {
      marks: [],
      results: [],
      ratings: [],
      remarks: [],
      studentAttendance: [],
      classAttendance: [],
      summaries: []
    }
  };
}

/** Seeds one student's assessment rows so the archive job has a real document. */
export async function seedArchiveRows(db: RepositoryDb, school: SeededSchool): Promise<void> {
  const base = school.schoolId * 1000;
  await db.insert(smMarkStores).values({
    id: base + 1,
    studentRollNo: 1,
    studentAddmissionNo: school.studentId,
    totalMarks: 30,
    isAbsent: 0,
    subjectId: school.subjectId,
    examTermId: school.termId,
    studentId: school.studentId,
    studentRecordId: school.recordId,
    classId: school.classId,
    sectionId: school.sectionId,
    schoolId: school.schoolId,
    academicId: school.academicId
  });
  await db.insert(smResultStores).values({
    id: base + 2,
    studentRollNo: 1,
    studentAddmissionNo: school.studentId,
    isAbsent: 0,
    totalMarks: 30,
    examTypeId: school.termId,
    subjectId: school.subjectId,
    studentId: school.studentId,
    studentRecordId: school.recordId,
    classId: school.classId,
    sectionId: school.sectionId,
    schoolId: school.schoolId,
    academicId: school.academicId
  });
  await db.insert(studentRatings).values({
    id: base + 3,
    rate: 4,
    attribute: "Punctuality",
    studentId: school.studentId,
    examTypeId: school.termId,
    academicId: school.academicId
  });
  await db.insert(teacherRemarks).values({
    id: base + 4,
    remark: "Good progress",
    studentId: school.studentId,
    examTypeId: school.termId,
    academicId: school.academicId
  });
  await db.insert(classAttendances).values({
    id: base + 5,
    daysOpened: 60,
    daysAbsent: 2,
    daysPresent: 58,
    examTypeId: school.termId,
    studentId: school.studentId,
    schoolId: school.schoolId,
    academicId: school.academicId
  });
  await db.insert(smAssignSubjects).values({
    id: base + 8,
    teacherId: school.staffId,
    classId: school.classId,
    sectionId: school.sectionId,
    subjectId: school.subjectId,
    schoolId: school.schoolId,
    academicId: school.academicId
  });
  await db.insert(smStudentAttendances).values([
    {
      id: base + 6,
      attendanceType: "present",
      attendanceDate: "2025-10-01",
      studentId: school.studentId,
      studentRecordId: school.recordId,
      classId: school.classId,
      sectionId: school.sectionId,
      schoolId: school.schoolId,
      academicId: school.academicId,
      activeStatus: 1
    },
    {
      id: base + 7,
      attendanceType: "absent",
      attendanceDate: "2025-10-02",
      studentId: school.studentId,
      studentRecordId: school.recordId,
      classId: school.classId,
      sectionId: school.sectionId,
      schoolId: school.schoolId,
      academicId: school.academicId,
      activeStatus: 1
    }
  ]);
}
