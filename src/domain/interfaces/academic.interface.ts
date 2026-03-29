export type SubjectType = "theory" | "practical";
export type EnrollmentStatus = "active" | "promoted" | "graduated" | "withdrawn" | "retained";
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type HomeworkStatus = "pending" | "submitted" | "evaluated" | "returned";
export type PromotionResult = "promoted" | "retained" | "graduated" | "withdrawn";

export interface IClass {
  id: number;
  tenantId: number;
  name: string;
  passMark: string | null;
  academicId: number;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ISection {
  id: number;
  tenantId: number;
  name: string;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IClassSection {
  id: number;
  classId: number;
  sectionId: number;
  tenantId: number;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ISubject {
  id: number;
  tenantId: number;
  name: string;
  code: string | null;
  type: SubjectType;
  passMark: string | null;
  academicId: number;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IEnrollment {
  id: number;
  tenantId: number;
  userId: number;
  classId: number | null;
  sectionId: number | null;
  academicId: number;
  rollNo: string | null;
  isDefault: number | null;
  status: EnrollmentStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IClassRoutine {
  id: number;
  tenantId: number;
  classId: number;
  sectionId: number;
  subjectId: number;
  teacherId: number | null;
  dayOfWeek: DayOfWeek;
  startTime: string | null;
  endTime: string | null;
  roomNo: string | null;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomework {
  id: number;
  tenantId: number;
  classId: number;
  sectionId: number;
  subjectId: number;
  homeworkDate: string;
  submissionDate: string;
  description: string | null;
  attachment: string | null;
  marks: string | null;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILesson {
  id: number;
  tenantId: number;
  classId: number;
  sectionId: number;
  subjectId: number;
  title: string;
  description: string | null;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ISubjectAssignment {
  id: number;
  tenantId: number;
  staffId: number;
  classId: number;
  sectionId: number;
  subjectId: number;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IClassTeacher {
  id: number;
  tenantId: number;
  classId: number;
  sectionId: number;
  staffId: number;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomeworkSubmission {
  id: number;
  tenantId: number;
  homeworkId: number;
  userId: number;
  enrollmentId: number | null;
  classId: number | null;
  sectionId: number | null;
  marks: string | null;
  status: HomeworkStatus;
  metadata: Record<string, any> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IPromotion {
  id: number;
  tenantId: number;
  userId: number;
  fromClassId: number;
  fromSectionId: number;
  toClassId: number;
  toSectionId: number;
  fromAcademicId: number;
  toAcademicId: number;
  result: PromotionResult;
  promotedBy: number | null;
  notes: string | null;
  promotedAt: Date | null;
  updatedAt: Date | null;
}

export interface ITimeline {
  id: number;
  tenantId: number;
  userId: number;
  type: string;
  title: string;
  description: string | null;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAcademicRepository {
  // Classes & Sections
  getClasses(tenantId: number, academicId: number): Promise<IClass[]>;
  getSectionsByClass(classId: number): Promise<ISection[]>;
  
  // Enrollments
  getEnrollmentByStudent(userId: number, academicId: number): Promise<IEnrollment | null>;
  createEnrollment(data: Partial<IEnrollment>): Promise<IEnrollment>;
  
  // Subjects
  getSubjectsByClass(classId: number, academicId: number): Promise<ISubject[]>;
  
  // Homework
  getHomeworkByClass(classId: number, sectionId: number, academicId: number): Promise<IHomework[]>;
  submitHomework(data: Partial<IHomeworkSubmission>): Promise<IHomeworkSubmission>;
  
  // Lessons
  getLessonsBySubject(subjectId: number, academicId: number): Promise<ILesson[]>;
}
