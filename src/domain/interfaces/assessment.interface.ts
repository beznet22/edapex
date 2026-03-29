export type ExamStatus = "pending" | "published" | "cancelled";
export type ResultStatus = "pass" | "fail" | "withheld";

export interface IExam {
  id: number;
  tenantId: number;
  title: string;
  examType: string;
  startDate: string | null;
  endDate: string | null;
  status: ExamStatus;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IExamSetup {
  id: number;
  examId: number;
  classId: number;
  sectionId: number;
  subjectId: number;
  tenantId: number;
  examDate: string | null;
  startTime: string | null;
  endTime: string | null;
  roomNo: string | null;
  marks: number | null;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IMark {
  id: number;
  examId: number;
  enrollmentId: number;
  subjectId: number;
  tenantId: number;
  marks: string | null;
  isAbsent: number | null;
  teacherRemarks: string | null;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IGrade {
  id: number;
  tenantId: number;
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
  getExams(tenantId: number, academicId: number): Promise<IExam[]>;
  getExamSetup(examId: number, classId: number): Promise<IExamSetup[]>;
  
  // Marks
  getMarksByExam(examId: number, classId: number, sectionId: number): Promise<IMark[]>;
  saveMarks(marks: Partial<IMark>[]): Promise<void>;
  
  // Grades
  getGrades(tenantId: number): Promise<IGrade[]>;
  getGradeForMark(tenantId: number, mark: number): Promise<IGrade | null>;
}
