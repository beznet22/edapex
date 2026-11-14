import type { AssessmentCategory } from "../../../constants/assessment";

export interface MarkStoreEntry {
  readonly subjectId: number;
  readonly marks: Readonly<Record<string, number>>;
  readonly learningOutcome?: string | null;
}

export interface SubjectAssignment {
  readonly subjectId: number;
  readonly teacherId: number | null;
}

export interface MarksPlanStudent {
  readonly studentId: number;
  readonly recordId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly schoolId: number;
  readonly academicId: number;
  readonly examTypeId: number;
}

export interface MarksPlanInput {
  readonly student: MarksPlanStudent;
  readonly category: AssessmentCategory;
  readonly markStore: readonly MarkStoreEntry[];
  readonly assignments: readonly SubjectAssignment[];
  readonly exams: ReadonlyMap<number, number>;
  readonly examSetups: ReadonlyMap<string, number>;
}

export interface PlannedMark {
  readonly studentRecordId: number;
  readonly studentId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly subjectId: number;
  readonly examTermId: number;
  readonly examSetupId: number;
  readonly totalMarks: number;
  readonly isAbsent: number;
  readonly academicId: number;
  readonly schoolId: number;
  readonly teacherId: number;
  readonly activeStatus: number;
}

export interface PlannedResult {
  readonly studentRecordId: number;
  readonly studentId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly subjectId: number;
  readonly examId: number;
  readonly examTypeId: number;
  readonly totalMarks: number;
  readonly teacherRemarks: string | null;
  readonly academicId: number;
  readonly schoolId: number;
  readonly activeStatus: number;
}

export interface MarksInputRow {
  readonly subjectId: number;
  readonly examTypeId: number;
  readonly marks: number;
  readonly fullMarks: number;
  readonly totalMarks: number;
  readonly percentage: number;
  readonly grade: string;
  readonly gpa: number;
  readonly isAbsent: boolean;
  readonly teacherRemarks?: string;
}

export interface MissingExam {
  readonly subjectId: number;
}

export interface MissingExamSetup {
  readonly subjectId: number;
  readonly title: string;
  readonly fullMarks: number;
}

export interface MarksPlan {
  readonly marks: readonly PlannedMark[];
  readonly results: readonly PlannedResult[];
  readonly marksInput: readonly MarksInputRow[];
  readonly missingExams: readonly MissingExam[];
  readonly missingSetups: readonly MissingExamSetup[];
}

export const examSetupKey = (subjectId: number, title: string): string =>
  `${subjectId}:${title.trim().toUpperCase()}`;
