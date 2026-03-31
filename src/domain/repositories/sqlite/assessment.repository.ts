import { db } from "../../../db/index.js";
import { 
  exams, 
  examSetups, 
  examMarks, 
  grades 
} from "../../../db/sqlite/domain-assessment.js";
import { 
  IAssessmentRepository, 
  IExam, 
  IExamSetup, 
  IMark, 
  IGrade 
} from "../../interfaces/assessment.interface.js";
import { eq, and, lte, gte } from "drizzle-orm";

export class SqliteAssessmentRepository implements IAssessmentRepository {
  private mapExam(row: any): IExam {
    return {
      ...row,
      startDate: row.startDate ? row.startDate.toString() : null,
      endDate: row.endDate ? row.endDate.toString() : null,
      status: row.activeStatus === 1 ? "published" : "pending",
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapSetup(row: any): IExamSetup {
    return {
      ...row,
      marks: row.examMark ? Number(row.examMark) : 0,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapMark(row: any): IMark {
    return {
      ...row,
      marks: row.totalMarks ? row.totalMarks.toString() : "0",
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  // --- Exams ---
  async getExams(tenantId: number, academicId: number, updatedSince?: Date): Promise<IExam[]> {
    const conditions = [
      eq(exams.tenantId, tenantId),
      eq(exams.academicId, academicId)
    ];

    if (updatedSince) {
      conditions.push(gte(exams.updatedAt, updatedSince));
    }

    const results = await db
      .select()
      .from(exams)
      .where(and(...conditions));
      
    return results.map((row: any) => this.mapExam(row));
  }

  async getExamSetup(examId: number, classId: number): Promise<IExamSetup[]> {
    const results = await db
      .select()
      .from(examSetups)
      .where(and(
        eq(examSetups.examId, examId),
        eq(examSetups.classId, classId)
      ));
    return results.map((row: any) => this.mapSetup(row));
  }

  // --- Marks ---
  async getMarksByExam(examId: number, classId: number, sectionId: number): Promise<IMark[]> {
    const results = await db
      .select({
        id: examMarks.id,
        userId: examMarks.userId,
        enrollmentId: examMarks.enrollmentId,
        examSetupId: examMarks.examSetupId,
        tenantId: examMarks.tenantId,
        totalMarks: examMarks.totalMarks,
        isAbsent: examMarks.isAbsent,
        teacherRemarks: examMarks.teacherRemarks,
        createdAt: examMarks.createdAt,
        updatedAt: examMarks.updatedAt
      })
      .from(examMarks)
      .innerJoin(examSetups, eq(examMarks.examSetupId, examSetups.id))
      .where(and(
        eq(examSetups.examId, examId),
        eq(examSetups.classId, classId),
        eq(examSetups.sectionId, sectionId)
      ));
    return results.map((row: any) => this.mapMark(row));
  }

  async saveMarks(tenantId: number, marks: Partial<IMark>[]): Promise<void> {
    if (marks.length === 0) return;

    const batches = marks.map((mark) => {
      if (mark.id) {
        return db.update(examMarks)
          .set({
            totalMarks: mark.marks ? parseFloat(mark.marks) : null,
            isAbsent: mark.isAbsent || 0,
            teacherRemarks: mark.teacherRemarks,
            updatedAt: new Date(),
          })
          .where(and(
            eq(examMarks.id, mark.id),
            eq(examMarks.tenantId, tenantId)
          ));
      } else {
        return db.insert(examMarks).values({
          tenantId: tenantId,
          examSetupId: mark.examSetupId!,
          enrollmentId: mark.enrollmentId!,
          userId: mark.userId!,
          totalMarks: mark.marks ? parseFloat(mark.marks) : null,
          isAbsent: mark.isAbsent || 0,
          teacherRemarks: mark.teacherRemarks,
        });
      }
    });

    // @ts-ignore - Drizzle batch expects a tuple but we passed an array, which is fine for runtime
    await db.batch(batches as any);
  }

  // --- Grades ---
  async getGrades(tenantId: number): Promise<IGrade[]> {
    const results = await db.select().from(grades).where(eq(grades.tenantId, tenantId));
    return results.map((row: any) => ({
      id: row.id,
      tenantId: row.tenantId,
      gradeName: row.name,
      gradePoint: row.point,
      minMark: row.fromMark,
      maxMark: row.toMark,
      description: row.description,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }

  async getGradeForMark(tenantId: number, mark: number): Promise<IGrade | null> {
    const [result] = await db
      .select()
      .from(grades)
      .where(and(
        eq(grades.tenantId, tenantId),
        lte(grades.fromMark, mark),
        gte(grades.toMark, mark)
      ));
    
    if (!result) return null;
    return {
      id: result.id,
      tenantId: result.tenantId,
      gradeName: result.name,
      gradePoint: result.point,
      minMark: result.fromMark,
      maxMark: result.toMark,
      description: result.description,
      createdAt: result.createdAt ? new Date(result.createdAt) : null,
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : null,
    };
  }
}
