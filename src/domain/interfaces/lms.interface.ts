export type ContentType = "video" | "document" | "quiz" | "external_url";
export type CourseStatus = "draft" | "published" | "archived";

export interface ILmsCourse {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  instructorId: string | null;
  feeMasterId: string | null;
  isFree: boolean | number;
  status: CourseStatus;
  academicId?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsCategory {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsModule {
  id: string;
  courseId: string;
  tenantId: string;
  title: string;
  order: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsContent {
  id: string;
  moduleId: string;
  tenantId: string;
  title: string;
  type: ContentType;
  content: string | null;
  url: string | null;
  order: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsCourseEnrollment {
  id: string;
  courseId: string;
  userId: string;
  tenantId: string;
  academicId?: string | null;
  enrolledAt: Date;
  completedAt: Date | null;
  progress: number; // 0-100
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsAssignment {
  id: string;
  courseId: string;
  tenantId: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  marks: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsRepository {
  // Courses
  getCourseById(tenantId: string, id: string): Promise<ILmsCourse | null>;
  getCoursesByTenant(tenantId: string, academicId: string): Promise<ILmsCourse[]>;
  createCourse(data: Partial<ILmsCourse>): Promise<ILmsCourse>;
  
  // Modules & Content
  getModulesByCourse(tenantId: string, courseId: string): Promise<ILmsModule[]>;
  getContentByModule(tenantId: string, moduleId: string): Promise<ILmsContent[]>;
  createModule(data: Partial<ILmsModule>): Promise<ILmsModule>;
  createContent(data: Partial<ILmsContent>): Promise<ILmsContent>;
  
  // Enrollments
  enrollUser(data: Partial<ILmsCourseEnrollment>): Promise<ILmsCourseEnrollment>;
  getUserEnrollments(tenantId: string, userId: string): Promise<ILmsCourseEnrollment[]>;
  updateProgress(tenantId: string, enrollmentId: string, progress: number): Promise<void>;
  
  // Assignments
  getAssignmentsByCourse(tenantId: string, courseId: string): Promise<ILmsAssignment[]>;
}
