import { db } from "../../../db/index.js";
import { 
  lmsCourses, 
  lmsModules, 
  lmsLessons, 
  lmsEnrollments, 
  lmsAssignments 
} from "../../../db/sqlite/domain-lms.js";
import { 
  ILmsRepository, 
  ILmsCourse, 
  ILmsModule, 
  ILmsContent, 
  ILmsCourseEnrollment, 
  ILmsAssignment 
} from "../../interfaces/lms.interface.js";
import { eq, and } from "drizzle-orm";

export class SqliteLmsRepository implements ILmsRepository {
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
  async getCourseById(id: number): Promise<ILmsCourse | null> {
    const [result] = await db.select().from(lmsCourses).where(eq(lmsCourses.id, id));
    return result ? this.mapCourse(result) : null;
  }

  async getCoursesByTenant(tenantId: number, academicId: number): Promise<ILmsCourse[]> {
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
  async getModulesByCourse(courseId: number): Promise<ILmsModule[]> {
    const results = await db
      .select()
      .from(lmsModules)
      .where(eq(lmsModules.courseId, courseId))
      .orderBy(lmsModules.sortOrder);
    return results.map((row: any) => this.mapModule(row));
  }

  async getContentByModule(moduleId: number): Promise<ILmsContent[]> {
    const results = await db
      .select()
      .from(lmsLessons)
      .where(eq(lmsLessons.moduleId, moduleId))
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
      completedAt: result.completionDate ? new Date(result.completionDate) : null,
      progress: result.progressPercent || 0,
      createdAt: result.createdAt ? new Date(result.createdAt) : null,
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : null,
    };
  }

  async getUserEnrollments(userId: number): Promise<ILmsCourseEnrollment[]> {
    const results = await db.select().from(lmsEnrollments).where(eq(lmsEnrollments.userId, userId));
    return results.map((row: any) => ({
      ...row,
      enrolledAt: row.enrollmentDate ? new Date(row.enrollmentDate) : new Date(),
      completedAt: row.completionDate ? new Date(row.completionDate) : null,
      progress: row.progressPercent || 0,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }

  async updateProgress(enrollmentId: number, progress: number): Promise<void> {
    await db.update(lmsEnrollments).set({ progressPercent: progress }).where(eq(lmsEnrollments.id, enrollmentId));
  }

  // --- Assignments ---
  async getAssignmentsByCourse(courseId: number): Promise<ILmsAssignment[]> {
    const results = await db.select().from(lmsAssignments).where(eq(lmsAssignments.courseId, courseId));
    return results.map((row: any) => ({
      ...row,
      marks: row.points,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }
}
