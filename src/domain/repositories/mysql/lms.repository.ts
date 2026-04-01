import { db } from "../../../db/index.js";
import { 
  lmsCourses, 
  lmsModules, 
  lmsLessons, 
  lmsEnrollments, 
  lmsAssignments 
} from "../../../db/mysql/domain-lms.js";
import { 
  ILmsRepository, 
  ILmsCourse, 
  ILmsModule, 
  ILmsContent, 
  ILmsCourseEnrollment, 
  ILmsAssignment 
} from "../../interfaces/lms.interface.js";
import { eq, and } from "drizzle-orm";

export class MySqlLmsRepository implements ILmsRepository {
  private mapCourse(row: any): ILmsCourse {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapModule(row: any): ILmsModule {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapContent(row: any): ILmsContent {
    return {
      ...row,
      type: row.lessonType,
      url: row.mediaUrl,
      order: row.sortOrder,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  // --- Courses ---
  async getCourseById(tenantId: string, id: string): Promise<ILmsCourse | null> {
    const [result] = await db
      .select()
      .from(lmsCourses)
      .where(and(eq(lmsCourses.id, id), eq(lmsCourses.tenantId, tenantId)));
    return result ? this.mapCourse(result) : null;
  }

  async getCoursesByTenant(tenantId: string, academicId: string): Promise<ILmsCourse[]> {
    const results = await db
      .select()
      .from(lmsCourses)
      .where(and(
        eq(lmsCourses.tenantId, tenantId)
        // Optional: filter by academicId if schema supports it
      ));
    return results.map((row: any) => this.mapCourse(row));
  }

  async createCourse(data: Partial<ILmsCourse>): Promise<ILmsCourse> {
    await db.insert(lmsCourses).values(data as any);
    const course = await this.getCourseById(data.tenantId!, data.id!);
    if (!course) throw new Error("Failed to create course");
    return course;
  }

  // --- Modules & Content ---
  async getModulesByCourse(tenantId: string, courseId: string): Promise<ILmsModule[]> {
    const results = await db
      .select()
      .from(lmsModules)
      .where(and(eq(lmsModules.courseId, courseId), eq(lmsModules.tenantId, tenantId)))
      .orderBy(lmsModules.sortOrder);
    return results.map((row: any) => this.mapModule(row));
  }

  async getContentByModule(tenantId: string, moduleId: string): Promise<ILmsContent[]> {
    const results = await db
      .select()
      .from(lmsLessons)
      .where(and(eq(lmsLessons.moduleId, moduleId), eq(lmsLessons.tenantId, tenantId)))
      .orderBy(lmsLessons.sortOrder);
    return results.map((row: any) => this.mapContent(row));
  }

  async createModule(data: Partial<ILmsModule>): Promise<ILmsModule> {
    await db.insert(lmsModules).values(data as any);
    const [row] = await db.select().from(lmsModules).where(and(eq(lmsModules.id, data.id!), eq(lmsModules.tenantId, data.tenantId!)));
    if (!row) throw new Error("Failed to create module");
    return this.mapModule(row);
  }

  async createContent(data: Partial<ILmsContent>): Promise<ILmsContent> {
    const lessonData = {
      id: data.id,
      tenantId: data.tenantId,
      moduleId: data.moduleId,
      title: data.title,
      content: data.content,
      lessonType: data.type,
      mediaUrl: data.url,
      sortOrder: data.order
    };
    await db.insert(lmsLessons).values(lessonData as any);
    const [row] = await db.select().from(lmsLessons).where(and(eq(lmsLessons.id, data.id!), eq(lmsLessons.tenantId, data.tenantId!)));
    if (!row) throw new Error("Failed to create lesson content");
    return this.mapContent(row);
  }

  // --- Enrollments ---
  async enrollUser(data: Partial<ILmsCourseEnrollment>): Promise<ILmsCourseEnrollment> {
    await db.insert(lmsEnrollments).values(data as any);
    const [row] = await db.select().from(lmsEnrollments).where(eq(lmsEnrollments.id, data.id!));
    if (!row) throw new Error("Failed to enroll user");
    return {
      ...row,
      enrolledAt: row.enrollmentDate ? new Date(row.enrollmentDate) : new Date(),
      completedAt: null,
      progress: row.progressPercent || 0,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  async getUserEnrollments(tenantId: string, userId: string): Promise<ILmsCourseEnrollment[]> {
    const results = await db
      .select()
      .from(lmsEnrollments)
      .where(and(eq(lmsEnrollments.userId, userId), eq(lmsEnrollments.tenantId, tenantId)));
    return results.map((row: any) => ({
      ...row,
      enrolledAt: row.enrollmentDate ? new Date(row.enrollmentDate) : new Date(),
      completedAt: null,
      progress: row.progressPercent || 0,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }

  async updateProgress(tenantId: string, enrollmentId: string, progress: number): Promise<void> {
    await db.update(lmsEnrollments)
      .set({ progressPercent: progress })
      .where(and(eq(lmsEnrollments.id, enrollmentId), eq(lmsEnrollments.tenantId, tenantId)));
  }

  // --- Assignments ---
  async getAssignmentsByCourse(tenantId: string, courseId: string): Promise<ILmsAssignment[]> {
    const results = await db
      .select()
      .from(lmsAssignments)
      .where(and(eq(lmsAssignments.courseId, courseId), eq(lmsAssignments.tenantId, tenantId)));
    return results.map((row: any) => ({
      ...row,
      marks: row.points,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }
}
