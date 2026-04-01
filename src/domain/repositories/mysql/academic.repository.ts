import { db } from "../../../db/index.js";
import { 
  classes, 
  sections, 
  classSections, 
  subjects, 
  enrollments, 
  homeworks, 
  homeworkSubmissions, 
  lessons 
} from "../../../db/mysql/domain-academic.js";
import { 
  IAcademicRepository, 
  IClass, 
  ISection, 
  IEnrollment, 
  ISubject, 
  IHomework, 
  IHomeworkSubmission, 
  ILesson 
} from "../../interfaces/academic.interface.js";
import { eq, and } from "drizzle-orm";

export class MySqlAcademicRepository implements IAcademicRepository {
  private mapClass(row: any): IClass {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapSection(row: any): ISection {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapEnrollment(row: any): IEnrollment {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapSubject(row: any): ISubject {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapHomework(row: any): IHomework {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapLesson(row: any): ILesson {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  // --- Classes & Sections ---
  async getClasses(tenantId: string, academicId: string): Promise<IClass[]> {
    const results = await db
      .select()
      .from(classes)
      .where(and(
        eq(classes.tenantId, tenantId),
        eq(classes.academicId, academicId)
      ));
    return results.map((row: any) => this.mapClass(row));
  }

  async getSectionsByClass(classId: string): Promise<ISection[]> {
    const results = await db
      .select({
        id: sections.id,
        tenantId: sections.tenantId,
        name: sections.name,
        activeStatus: sections.activeStatus,
        createdAt: sections.createdAt,
        updatedAt: sections.updatedAt
      })
      .from(classSections)
      .innerJoin(sections, eq(classSections.sectionId, sections.id))
      .where(eq(classSections.classId, classId));
    return results.map((row: any) => this.mapSection(row));
  }

  // --- Enrollments ---
  async getEnrollmentByStudent(userId: string, academicId: string): Promise<IEnrollment | null> {
    const [result] = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.userId, userId),
        eq(enrollments.academicId, academicId)
      ));
    return result ? this.mapEnrollment(result) : null;
  }

  async createEnrollment(data: Partial<IEnrollment>): Promise<IEnrollment> {
    const [result] = await db.insert(enrollments).values(data as any);
    const [newEnrollment] = await db.select().from(enrollments).where(eq(enrollments.id, data.id!));
    if (!newEnrollment) throw new Error("Failed to create enrollment");
    return this.mapEnrollment(newEnrollment);
  }

  // --- Subjects ---
  async getSubjectsByClass(classId: string, academicId: string): Promise<ISubject[]> {
    const results = await db
      .select()
      .from(subjects)
      .where(and(
        eq(subjects.academicId, academicId)
        // Note: subjects are often class-agnostic in the schema but mapped via routines/assignments
      ));
    return results.map((row: any) => this.mapSubject(row));
  }

  // --- Homework ---
  async getHomeworkByClass(classId: string, sectionId: string, academicId: string): Promise<IHomework[]> {
    const results = await db
      .select()
      .from(homeworks)
      .where(and(
        eq(homeworks.classId, classId),
        eq(homeworks.sectionId, sectionId),
        eq(homeworks.academicId, academicId)
      ));
    return results.map((row: any) => this.mapHomework(row));
  }

  async submitHomework(data: Partial<IHomeworkSubmission>): Promise<IHomeworkSubmission> {
    const [result] = await db.insert(homeworkSubmissions).values(data as any);
    const [submission] = await db.select().from(homeworkSubmissions).where(eq(homeworkSubmissions.id, data.id!));
    if (!submission) throw new Error("Failed to submit homework");
    return submission as any;
  }

  // --- Lessons ---
  async getLessonsBySubject(subjectId: string, academicId: string): Promise<ILesson[]> {
    const results = await db
      .select()
      .from(lessons)
      .where(and(
        eq(lessons.subjectId, subjectId),
        eq(lessons.academicId, academicId)
      ));
    return results.map((row: any) => this.mapLesson(row));
  }
}
