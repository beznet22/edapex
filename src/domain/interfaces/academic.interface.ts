export type SubjectType = "theory" | "practical";
export type EnrollmentStatus = "active" | "promoted" | "graduated" | "withdrawn" | "retained";
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type HomeworkStatus = "pending" | "submitted" | "evaluated" | "returned";
export type PromotionResult = "promoted" | "retained" | "graduated" | "withdrawn";

export interface IClass {
  id: string;
  tenantId: string;
  name: string;
  passMark: string | null;
  academicId: string;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ISection {
  id: string;
  tenantId: string;
  name: string;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IClassSection {
  id: string;
  classId: string;
  sectionId: string;
  tenantId: string;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ISubject {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  type: SubjectType;
  passMark: string | null;
  academicId: string;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IEnrollment {
  id: string;
  tenantId: string;
  userId: string;
  classId: string | null;
  sectionId: string | null;
  academicId: string;
  rollNo: string | null;
  isDefault: number | null;
  status: EnrollmentStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IClassRoutine {
  id: string;
  tenantId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string | null;
  dayOfWeek: DayOfWeek;
  startTime: string | null;
  endTime: string | null;
  roomNo: string | null;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomework {
  id: string;
  tenantId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  homeworkDate: string;
  submissionDate: string;
  description: string | null;
  attachment: string | null;
  marks: string | null;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILesson {
  id: string;
  tenantId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  title: string;
  description: string | null;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ISubjectAssignment {
  id: string;
  tenantId: string;
  staffId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IClassTeacher {
  id: string;
  tenantId: string;
  classId: string;
  sectionId: string;
  staffId: string;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomeworkSubmission {
  id: string;
  tenantId: string;
  homeworkId: string;
  userId: string;
  enrollmentId: string | null;
  classId: string | null;
  sectionId: string | null;
  marks: string | null;
  status: HomeworkStatus;
  metadata: Record<string, any> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IPromotion {
  id: string;
  tenantId: string;
  userId: string;
  fromClassId: string;
  fromSectionId: string;
  toClassId: string;
  toSectionId: string;
  fromAcademicId: string;
  toAcademicId: string;
  result: PromotionResult;
  promotedBy: string | null;
  notes: string | null;
  promotedAt: Date | null;
  updatedAt: Date | null;
}

export interface ITimeline {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  description: string | null;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAcademicRepository {
  // Classes & Sections
  getClasses(tenantId: string, academicId: string): Promise<IClass[]>;
  getSectionsByClass(classId: string): Promise<ISection[]>;
  
  // Enrollments
  getEnrollmentByStudent(userId: string, academicId: string): Promise<IEnrollment | null>;
  createEnrollment(data: Partial<IEnrollment>): Promise<IEnrollment>;
  
  // Subjects
  getSubjectsByClass(classId: string, academicId: string): Promise<ISubject[]>;
  
  // Homework
  getHomeworkByClass(classId: string, sectionId: string, academicId: string): Promise<IHomework[]>;
  submitHomework(data: Partial<IHomeworkSubmission>): Promise<IHomeworkSubmission>;
  
  // Lessons
  getLessonsBySubject(subjectId: string, academicId: string): Promise<ILesson[]>;
}
