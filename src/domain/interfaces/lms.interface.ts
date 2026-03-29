export type ContentType = "video" | "document" | "quiz" | "external_url";
export type CourseStatus = "draft" | "published" | "archived";

export interface ILmsCourse {
  id: number;
  tenantId: number;
  title: string;
  description: string | null;
  thumbnail: string | null;
  instructorId: number | null;
  status: CourseStatus;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsCategory {
  id: number;
  tenantId: number;
  name: string;
  parentId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsModule {
  id: number;
  courseId: number;
  tenantId: number;
  title: string;
  order: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsContent {
  id: number;
  moduleId: number;
  tenantId: number;
  title: string;
  type: ContentType;
  content: string | null;
  url: string | null;
  order: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsCourseEnrollment {
  id: number;
  courseId: number;
  userId: number;
  tenantId: number;
  enrolledAt: Date;
  completedAt: Date | null;
  progress: number; // 0-100
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsAssignment {
  id: number;
  courseId: number;
  tenantId: number;
  title: string;
  description: string | null;
  dueDate: Date | null;
  marks: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILmsRepository {
  // Courses
  getCourseById(id: number): Promise<ILmsCourse | null>;
  getCoursesByTenant(tenantId: number, academicId: number): Promise<ILmsCourse[]>;
  createCourse(data: Partial<ILmsCourse>): Promise<ILmsCourse>;
  
  // Modules & Content
  getModulesByCourse(courseId: number): Promise<ILmsModule[]>;
  getContentByModule(moduleId: number): Promise<ILmsContent[]>;
  createModule(data: Partial<ILmsModule>): Promise<ILmsModule>;
  createContent(data: Partial<ILmsContent>): Promise<ILmsContent>;
  
  // Enrollments
  enrollUser(data: Partial<ILmsCourseEnrollment>): Promise<ILmsCourseEnrollment>;
  getUserEnrollments(userId: number): Promise<ILmsCourseEnrollment[]>;
  updateProgress(enrollmentId: number, progress: number): Promise<void>;
  
  // Assignments
  getAssignmentsByCourse(courseId: number): Promise<ILmsAssignment[]>;
}
