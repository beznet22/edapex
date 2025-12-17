import type { ExamType, Rating, Remark } from "$lib/schema/result";
import * as schema from "$lib/server/db/schema";

export type ResultData = typeof schema.smResultStores.$inferSelect;
export type RemarkData = typeof schema.teacherRemarks.$inferSelect;
export type RatingData = typeof schema.studentRatings.$inferSelect;
export type MarkStoreRecord = typeof schema.smMarkStores.$inferSelect;
export type ResultStoreRecord = typeof schema.smResultStores.$inferSelect;
export type ExamSetup = typeof schema.smExamSetups.$inferSelect;
export type NewSmMarkStore = typeof schema.smMarkStores.$inferInsert;
export type NewSmResultStore = typeof schema.smResultStores.$inferInsert;
export type NewTeacherRemark = typeof schema.teacherRemarks.$inferInsert;
export type NewStudentRating = typeof schema.studentRatings.$inferInsert;
export type NewLearningOutcome = typeof schema.smMarkStores.$inferInsert;
export type NewExamSetup = typeof schema.smExamSetups.$inferInsert;
export type StudentCategory = typeof schema.teacherRemarks.$inferInsert;
export type Subject = typeof schema.smSubjects.$inferSelect;
export type NewExam = typeof schema.smExams.$inferInsert;

export type MarkStoreResult = typeof schema.smMarkStores.$inferSelect & {
  exam_title: string;
  subject_code: string;
};
export type AcademicYearData = typeof schema.smAcademicYears.$inferSelect;
export type ExamTypeData = typeof schema.smExamTypes.$inferSelect;
export type ClassAttendanceData = {
  days_opened: number;
  days_absent: number;
  days_present: number;
};

export interface GetExistingMarkRecordParams {
  classId: number;
  sectionId: number;
  subjectId: number;
  examTermId: number;
  studentRecordId: number;
  examSetupId: number;
  studentId: number;
  academicId: number;
  schoolId: number;
}

export interface GetExistingResultRecordParams {
  classId: number;
  sectionId: number;
  subjectId: number;
  examTypeId: number;
  studentRecordId: number;
  studentId: number;
  academicId: number;
  schoolId: number;
}

export interface GetSubjectFullMarkParams {
  examTypeId: number;
  subjectId: number;
  classId: number;
  sectionId: number;
  academicId: number;
  schoolId: number;
}

export interface GetMarkGradeParams {
  percentage: number;
  academicId: number;
  schoolId: number;
}

export interface GetExamSetupParams {
  studentClassId: number;
  studentSectionId: number;
  examTypeId: number;
  academicId: number;
  schoolId: number;
}

export type MarkData = {
  totalMarks: number;
  teacherRemarks: string | null;
  examTitle: string | null;
  subjectCode: string | null;
  isAbsent: number;
  subjectName: string | null;
};

export type QueryResultData = {
  examType?: ExamType;
  academic?: AcademicYearData;
  classResults: ResultData[];
  marks: MarkData[];
  attendance: typeof schema.classAttendances.$inferSelect | undefined;
  ratings:Rating;
  remark: Remark;
};

export interface SchoolData {
  name: string;
  logo: string;
  city: string;
  state: string;
  title: string;
  vacation_date: string;
}

export type Category = "DAYCARE" | "NURSERY" | "GRADEK" | "LOWERBASIC" | "MIDDLEBASIC";
export interface StudentDetail {
  id: number;
  examId: number;
  fullName: string;
  gender: string;
  parentEmail: string;
  parentName: string;
  term: string;
  title: string;
  category: Category;
  className: string;
  sectionName: string;
  adminNo: number;
  sessionYear: string;
  opened: number;
  absent: number;
  present: number;
  studentPhoto?: string;
  token: string;
}

export type RecordData = {
  subject: string;
  subjectCode: string;
  titles: string[];
  marks: number[];
  totalScore: number;
  grade: string;
} & { color?: string; objectives?: string[] };

export interface ClassAverage {
  min: { studentId?: number; value: string };
  max: { studentId?: number; value: string };
}

export interface ScoreData {
  total: number;
  average: number;
  maxScores: number;
  classAverage: ClassAverage;
}
