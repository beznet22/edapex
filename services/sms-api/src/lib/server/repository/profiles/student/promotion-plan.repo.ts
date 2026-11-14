import { and, eq, gt, sql } from "drizzle-orm";

import { smClasses, smStudents, studentRecords } from "../../../db/schema";
import { withErrorHandling } from "../../base/error-handling";
import type { ScopedRepositoryContext } from "../../base/repository-context";

export interface PromotionClassPlan {
  readonly classId: number;
  readonly className: string;
  readonly nextClassId: number | null;
  readonly sortOrder: number | null;
  readonly studentCount: number;
}

export interface PromotionCandidate {
  readonly studentId: number;
  readonly fullName: string | null;
  readonly admissionNo: number | null;
  readonly recordId: number;
  readonly classId: number;
  readonly sectionId: number | null;
  readonly rollNo: string | null;
}

export async function countPlanByClass(
  ctx: ScopedRepositoryContext,
  sourceAcademicId: number
): Promise<readonly PromotionClassPlan[]> {
  return withErrorHandling(async () => {
    const rows = await ctx.db.all<{
      classId: number;
      className: string;
      nextClassId: number | null;
      sortOrder: number | null;
      studentCount: number;
    }>(sql`
      SELECT r.class_id AS classId, c.class_name AS className,
             c.next_class_id AS nextClassId, c.sort_order AS sortOrder,
             COUNT(*) AS studentCount
      FROM student_records r
      INNER JOIN sm_classes c ON c.id = r.class_id
      WHERE r.school_id = ${ctx.tenant.schoolId}
        AND r.academic_id = ${sourceAcademicId}
        AND r.is_default = 1
      GROUP BY r.class_id, c.class_name, c.next_class_id, c.sort_order
      ORDER BY c.sort_order DESC
    `);
    return rows.map((row) => ({
      classId: Number(row.classId),
      className: String(row.className),
      nextClassId: row.nextClassId === null ? null : Number(row.nextClassId),
      sortOrder: row.sortOrder === null ? null : Number(row.sortOrder),
      studentCount: Number(row.studentCount)
    }));
  }, "countPlanByClass");
}

export async function countStudentsWithoutCurrentRecord(
  ctx: ScopedRepositoryContext,
  sourceAcademicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const row = await ctx.db.get<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM sm_students s
      WHERE s.school_id = ${ctx.tenant.schoolId}
        AND NOT EXISTS (
          SELECT 1 FROM student_records r
          WHERE r.student_id = s.id AND r.school_id = s.school_id
            AND r.academic_id = ${sourceAcademicId} AND r.is_default = 1
        )
    `);
    return Number(row?.count ?? 0);
  }, "countStudentsWithoutCurrentRecord");
}

/** Default records with no class at all; the class-by-class plan cannot see them. */
export async function countStudentsWithoutClassRecord(
  ctx: ScopedRepositoryContext,
  sourceAcademicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const row = await ctx.db.get<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM student_records r
      WHERE r.school_id = ${ctx.tenant.schoolId}
        AND r.academic_id = ${sourceAcademicId}
        AND r.is_default = 1
        AND r.class_id IS NULL
    `);
    return Number(row?.count ?? 0);
  }, "countStudentsWithoutClassRecord");
}

export async function listCandidates(
  ctx: ScopedRepositoryContext,
  input: {
    readonly sourceAcademicId: number;
    readonly classId: number;
    readonly afterStudentId: number;
    readonly limit: number;
  }
): Promise<readonly PromotionCandidate[]> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({
        studentId: smStudents.id,
        fullName: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
        recordId: studentRecords.id,
        classId: studentRecords.classId,
        sectionId: studentRecords.sectionId,
        rollNo: studentRecords.rollNo
      })
      .from(smStudents)
      .innerJoin(
        studentRecords,
        and(
          eq(studentRecords.studentId, smStudents.id),
          eq(studentRecords.schoolId, smStudents.schoolId),
          eq(studentRecords.academicId, input.sourceAcademicId),
          eq(studentRecords.isDefault, 1)
        )
      )
      .where(
        and(
          eq(smStudents.schoolId, ctx.tenant.schoolId),
          eq(studentRecords.classId, input.classId),
          gt(smStudents.id, input.afterStudentId)
        )
      )
      .orderBy(smStudents.id)
      .limit(input.limit);
    return rows.map((row) => ({
      studentId: row.studentId,
      fullName: row.fullName,
      admissionNo: row.admissionNo,
      recordId: row.recordId,
      classId: row.classId ?? 0,
      sectionId: row.sectionId,
      rollNo: row.rollNo
    }));
  }, "listCandidates");
}

export async function findSourceClassName(
  ctx: ScopedRepositoryContext,
  classId: number
): Promise<string | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ className: smClasses.className })
      .from(smClasses)
      .where(and(eq(smClasses.id, classId), eq(smClasses.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    return row?.className ?? null;
  }, "findSourceClassName");
}
