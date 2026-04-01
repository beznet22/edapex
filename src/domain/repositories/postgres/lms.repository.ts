import { db } from "../../../db/index.js";
import { 
  lmsCourses, 
  lmsModules, 
  lmsLessons, 
  lmsEnrollments, 
  lmsAssignments 
} from "../../../db/postgres/domain-lms.js";
import { 
  ILmsRepository, 
  ILmsCourse, 
  ILmsModule, 
  ILmsContent, 
  ILmsCourseEnrollment, 
  ILmsAssignment 
} from "../../interfaces/lms.interface.js";
import { eq, and } from "drizzle-orm";

export class PostgresLmsRepository implements ILmsRepository {
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
    const [result] = await db.select().from(lmsCourses).where(and(eq(lmsCourses.id, id), eq(lmsCourses.tenantId, tenantId)));
    return result ? this.mapCourse(result) : null;
  }

  async getCoursesByTenant(tenantId: string): Promise<ILmsCourse[]> {
    const results = await db
      .select()
      .from(lmsCourses)
      .where(and(eq(lmsCourses.tenantId, tenantId)));
    return results.map((row: any) => this.mapCourse(row));
  }

  async createCourse(data: Partial<ILmsCourse>): Promise<ILmsCourse> {
    const [result] = await db.insert(lmsCourses).values(data as any).returning();
    if (!result) throw new Error("Failed to create course");
    return this.mapCourse(result);
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
    const [result] = await db.insert(lmsModules).values(data as any).returning();
    if (!result) throw new Error("Failed to create module");
    return this.mapModule(result);
  }

  async createContent(data: Partial<ILmsContent>): Promise<ILmsContent> {
    const lessonData = {
      moduleId: data.moduleId,
      title: data.title,
      content: data.content,
      lessonType: data.type,
      mediaUrl: data.url,
      sortOrder: data.order
    };
    const [result] = await db.insert(lmsLessons).values(lessonData as any).returning();
    if (!result) throw new Error("Failed to create lesson content");
    return this.mapContent(result);
  }

  // --- Enrollments ---
  async enrollUser(data: Partial<ILmsCourseEnrollment>): Promise<ILmsCourseEnrollment> {
    const [result] = await db.insert(lmsEnrollments).values(data as any).returning();
    if (!result) throw new Error("Failed to enroll user");
    return {
      ...result,
      enrolledAt: result.enrollmentDate ? new Date(result.enrollmentDate) : new Date(),
      completedAt: null,
      progress: result.progressPercent || 0,
      createdAt: result.createdAt ? new Date(result.createdAt) : null,
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : null,
    };
  }

  async getUserEnrollments(tenantId: string, userId: string): Promise<ILmsCourseEnrollment[]> {
    const results = await db.select().from(lmsEnrollments).where(and(eq(lmsEnrollments.userId, userId), eq(lmsEnrollments.tenantId, tenantId)));
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
    await db.update(lmsEnrollments).set({ progressPercent: progress }).where(and(eq(lmsEnrollments.id, enrollmentId), eq(lmsEnrollments.tenantId, tenantId)));
  }

  // --- Assignments ---
  async getAssignmentsByCourse(tenantId: string, courseId: string): Promise<ILmsAssignment[]> {
    const results = await db.select().from(lmsAssignments).where(and(eq(lmsAssignments.courseId, courseId), eq(lmsAssignments.tenantId, tenantId)));
    return results.map((row: any) => ({
      ...row,
      marks: row.points,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }
}
