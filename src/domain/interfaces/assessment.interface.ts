export type ExamStatus = "pending" | "published" | "cancelled";
export type ResultStatus = "pass" | "fail" | "withheld";

export interface IExam {
  id: string;
  tenantId: string;
  title: string;
  examType: string;
  startDate: string | null;
  endDate: string | null;
  status: ExamStatus;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IExamSetup {
  id: string;
  examId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  tenantId: string;
  examDate: string | null;
  startTime: string | null;
  endTime: string | null;
  roomNo: string | null;
  marks: number | null;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IMark {
  id: string;
  userId: string;
  enrollmentId: string;
  examSetupId: string;
  tenantId: string;
  marks: string | null;
  isAbsent: number | null;
  teacherRemarks: string | null;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IGrade {
  id: string;
  tenantId: string;
  gradeName: string;
  gradePoint: string;
  minMark: string;
  maxMark: string;
  description: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAssessmentRepository {
  // Exams
  getExams(tenantId: string, academicId: string, updatedSince?: Date): Promise<IExam[]>;
  getExamSetup(tenantId: string, examId: string, classId: string): Promise<IExamSetup[]>;
  
  // Marks
  getMarksByExam(tenantId: string, examId: string, classId: string, sectionId: string): Promise<IMark[]>;
  saveMarks(tenantId: string, marks: Partial<IMark>[]): Promise<void>;
  
  // Grades
  getGrades(tenantId: string): Promise<IGrade[]>;
  getGradeForMark(tenantId: string, mark: number): Promise<IGrade | null>;
}
