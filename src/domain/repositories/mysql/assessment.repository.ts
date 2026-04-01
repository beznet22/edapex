import { db } from "../../../db/index.js";
import { 
  exams, 
  examSetups, 
  examMarks, 
  grades 
} from "../../../db/mysql/domain-assessment.js";
import { 
  IAssessmentRepository, 
  IExam, 
  IExamSetup, 
  IMark, 
  IGrade 
} from "../../interfaces/assessment.interface.js";
import { eq, and, lte, gte, sql } from "drizzle-orm";

export class MySqlAssessmentRepository implements IAssessmentRepository {
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
  async getExams(tenantId: string, academicId: string): Promise<IExam[]> {
    const results = await db
      .select()
      .from(exams)
      .where(and(
        eq(exams.tenantId, tenantId),
        eq(exams.academicId, academicId)
      ));
    return results.map((row: any) => this.mapExam(row));
  }

  async getExamSetup(tenantId: string, examId: string, classId: string): Promise<IExamSetup[]> {
    const results = await db
      .select()
      .from(examSetups)
      .where(and(
        eq(examSetups.examId, examId),
        eq(examSetups.classId, classId),
        eq(examSetups.tenantId, tenantId)
      ));
    return results.map((row: any) => this.mapSetup(row));
  }

  // --- Marks ---
  async getMarksByExam(tenantId: string, examId: string, classId: string, sectionId: string): Promise<IMark[]> {
    const results = await db
      .select({
        id: examMarks.id,
        examId: examSetups.examId,
        enrollmentId: examMarks.enrollmentId,
        subjectId: examSetups.subjectId,
        tenantId: examMarks.tenantId,
        totalMarks: examMarks.totalMarks,
        isAbsent: examMarks.isAbsent,
        teacherRemarks: examMarks.teacherRemarks,
        createdAt: examMarks.createdAt,
        updatedAt: examMarks.updatedAt
      })
      .from(examMarks)
      .innerJoin(examSetups, and(
        eq(examMarks.examSetupId, examSetups.id),
        eq(examMarks.tenantId, examSetups.tenantId)
      ))
      .where(and(
        eq(examSetups.examId, examId),
        eq(examSetups.classId, classId),
        eq(examSetups.sectionId, sectionId),
        eq(examMarks.tenantId, tenantId)
      ));
    return results.map((row: any) => this.mapMark(row));
  }

  async saveMarks(tenantId: string, marks: Partial<IMark>[]): Promise<void> {
    for (const mark of marks) {
      if (!mark.id) {
        // Need tenantId for creation if not provided in mark
      } else {
        await db.update(examMarks)
          .set({ 
            totalMarks: mark.marks, 
            isAbsent: mark.isAbsent as any,
            teacherRemarks: mark.teacherRemarks 
          })
          .where(and(eq(examMarks.id, mark.id), eq(examMarks.tenantId, tenantId)));
      }
    }
  }

  // --- Grades ---
  async getGrades(tenantId: string): Promise<IGrade[]> {
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

  async getGradeForMark(tenantId: string, mark: number): Promise<IGrade | null> {
    const [result] = await db
      .select()
      .from(grades)
      .where(and(
        eq(grades.tenantId, tenantId),
        lte(grades.fromMark, mark.toString()),
        gte(grades.toMark, mark.toString())
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
