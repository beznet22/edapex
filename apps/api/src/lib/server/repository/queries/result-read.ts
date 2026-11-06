import { and, eq } from "drizzle-orm";

import {
  classAttendances,
  smAcademicYears,
  smExamSetups,
  smExamTypes,
  smMarkStores,
  smResultStores,
  smSubjects,
  studentRatings,
  teacherRemarks
} from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface ResultRecordReadRow {
  readonly studentId: number | null;
  readonly resultId: number;
  readonly subjectId: number | null;
  readonly subjectName: string | null;
  readonly subjectCode: string | null;
  readonly teacherRemarks: string | null;
  readonly examTypeId?: number | null;
  readonly totalMarks?: number | null;
}

export interface MarkReadRow {
  readonly studentId: number | null;
  readonly markId: number;
  readonly subjectId: number | null;
  readonly totalMarks: number;
  readonly examTitle: string | null;
  readonly examMark: number | null;
  readonly subjectCode: string | null;
  readonly isAbsent: number;
  readonly subjectName: string | null;
}

export interface ClassResultReadRow {
  readonly studentId: number | null;
  readonly resultId: number;
  readonly subjectId: number | null;
  readonly totalMarks: number;
  readonly totalGpaGrade: string | null;
  readonly examTypeId: number | null;
}

export interface QueryResultData {
  readonly examType: {
    readonly id: number;
    readonly name: string;
    readonly sequence: number;
    readonly legacySuffix: string | null;
  } | null;
  readonly academic: { readonly id: number; readonly title: string; readonly year: string } | null;
  readonly resultRecords: readonly ResultRecordReadRow[];
  readonly marks: readonly MarkReadRow[];
  readonly classResults: readonly ClassResultReadRow[];
  readonly ratings: readonly (typeof studentRatings.$inferSelect)[];
  readonly remark: (typeof teacherRemarks.$inferSelect) | null;
  readonly attendance: (typeof classAttendances.$inferSelect) | null;
}

/** One student's complete term view; spans results, feedback and attendance. */
export async function queryResultData(
  ctx: ScopedRepositoryContext,
  studentId: number,
  examId: number
): Promise<QueryResultData> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;

    const [term] = await ctx.db
      .select({
        id: smExamTypes.id,
        name: smExamTypes.name,
        sequence: smExamTypes.sequence,
        legacySuffix: smExamTypes.legacySuffix
      })
      .from(smExamTypes)
      .where(
        and(
          eq(smExamTypes.id, examId),
          eq(smExamTypes.academicId, academicId),
          eq(smExamTypes.schoolId, schoolId)
        )
      )
      .limit(1);

    const [academic] = await ctx.db
      .select({ id: smAcademicYears.id, title: smAcademicYears.title, year: smAcademicYears.year })
      .from(smAcademicYears)
      .where(and(eq(smAcademicYears.id, academicId), eq(smAcademicYears.schoolId, schoolId)))
      .limit(1);

    const resultRecords = await ctx.db
      .select({
        studentId: smResultStores.studentId,
        resultId: smResultStores.id,
        subjectId: smResultStores.subjectId,
        subjectName: smSubjects.subjectName,
        subjectCode: smSubjects.subjectCode,
        teacherRemarks: smResultStores.teacherRemarks
      })
      .from(smResultStores)
      .leftJoin(smSubjects, eq(smResultStores.subjectId, smSubjects.id))
      .where(
        and(
          eq(smResultStores.studentId, studentId),
          eq(smResultStores.examTypeId, examId),
          eq(smResultStores.activeStatus, 1),
          eq(smResultStores.schoolId, schoolId),
          eq(smResultStores.academicId, academicId)
        )
      );

    const marks = await ctx.db
      .select({
        studentId: smMarkStores.studentId,
        markId: smMarkStores.id,
        subjectId: smSubjects.id,
        totalMarks: smMarkStores.totalMarks,
        examTitle: smExamSetups.examTitle,
        examMark: smExamSetups.examMark,
        subjectCode: smSubjects.subjectCode,
        isAbsent: smMarkStores.isAbsent,
        subjectName: smSubjects.subjectName
      })
      .from(smMarkStores)
      .leftJoin(smSubjects, eq(smMarkStores.subjectId, smSubjects.id))
      .leftJoin(smExamSetups, eq(smMarkStores.examSetupId, smExamSetups.id))
      .where(
        and(
          eq(smMarkStores.studentId, studentId),
          eq(smMarkStores.examTermId, examId),
          eq(smMarkStores.activeStatus, 1),
          eq(smMarkStores.schoolId, schoolId),
          eq(smMarkStores.academicId, academicId)
        )
      );

    const [record] = await ctx.db
      .select({
        classId: smResultStores.classId,
        sectionId: smResultStores.sectionId
      })
      .from(smResultStores)
      .where(
        and(
          eq(smResultStores.studentId, studentId),
          eq(smResultStores.examTypeId, examId),
          eq(smResultStores.schoolId, schoolId)
        )
      )
      .limit(1);

    const classResults =
      record?.classId !== null && record?.classId !== undefined && record.sectionId !== null
        ? await ctx.db
            .select({
              studentId: smResultStores.studentId,
              resultId: smResultStores.id,
              subjectId: smResultStores.subjectId,
              totalMarks: smResultStores.totalMarks,
              totalGpaGrade: smResultStores.totalGpaGrade,
              examTypeId: smResultStores.examTypeId
            })
            .from(smResultStores)
            .where(
              and(
                eq(smResultStores.examTypeId, examId),
                eq(smResultStores.classId, record.classId),
                eq(smResultStores.sectionId, record.sectionId),
                eq(smResultStores.activeStatus, 1),
                eq(smResultStores.schoolId, schoolId)
              )
            )
        : [];

    const ratings = await ctx.db
      .select()
      .from(studentRatings)
      .where(
        and(
          eq(studentRatings.studentId, studentId),
          eq(studentRatings.examTypeId, examId),
          eq(studentRatings.academicId, academicId)
        )
      );

    const [remark] = await ctx.db
      .select()
      .from(teacherRemarks)
      .where(
        and(
          eq(teacherRemarks.studentId, studentId),
          eq(teacherRemarks.examTypeId, examId),
          eq(teacherRemarks.academicId, academicId)
        )
      )
      .limit(1);

    const [attendance] = await ctx.db
      .select()
      .from(classAttendances)
      .where(
        and(
          eq(classAttendances.studentId, studentId),
          eq(classAttendances.examTypeId, examId),
          eq(classAttendances.schoolId, schoolId)
        )
      )
      .limit(1);

    return {
      examType: term ?? null,
      academic: academic ?? null,
      resultRecords,
      marks,
      classResults,
      ratings,
      remark: remark ?? null,
      attendance: attendance ?? null
    };
  }, "queryResultData");
}
