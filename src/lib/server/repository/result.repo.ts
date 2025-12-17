import * as schema from "$lib/server/db/schema";
import { and, avg, eq, asc, sql } from "drizzle-orm";
import { BaseRepository } from "./base.repo";
import { type StudentDetails } from "./student.repo";
import type {
  ExamSetup,
  GetExamSetupParams,
  GetMarkGradeParams,
  GetSubjectFullMarkParams,
  NewExam,
  NewExamSetup,
  NewLearningOutcome,
  NewSmMarkStore,
  NewSmResultStore,
  NewStudentRating,
  NewTeacherRemark,
  QueryResultData,
  RatingData,
  RemarkData,
  StudentCategory,
  StudentDetail,
  Subject,
} from "$lib/types/result-types";
import { jsonArrayAgg } from "../helpers";
import type { Rating, Remark } from "$lib/schema/result";

export class ResultsRepository extends BaseRepository {
  async getStudentRatings(f: {
    studentId?: number;
    examTypeId?: number;
    academicId?: number;
  }): Promise<Rating> {
    return this.withErrorHandling(
      () =>
        this.db
          .select({
            attribute: schema.studentRatings.attribute,
            rate: schema.studentRatings.rate,
            color: schema.studentRatings.color,
            remark: schema.studentRatings.remark,
          })
          .from(schema.studentRatings)
          .where(
            this.optionalFilters([
              f.studentId ? eq(schema.studentRatings.studentId, f.studentId) : undefined,
              f.examTypeId ? eq(schema.studentRatings.examTypeId, f.examTypeId) : undefined,
              f.academicId ? eq(schema.studentRatings.academicId, f.academicId) : undefined,
            ])
          ),
      "getStudentRatings"
    );
  }

  async getTeacherRemarks(f: {
    studentId?: number;
    examTypeId?: number;
    academicId?: number;
    teacherId?: number;
  }): Promise<Remark[]> {
    return this.withErrorHandling(
      () =>
        this.db
          .select({ remark: schema.teacherRemarks.remark })
          .from(schema.teacherRemarks)
          .where(
            this.optionalFilters([
              f.studentId ? eq(schema.teacherRemarks.studentId, f.studentId) : undefined,
              f.examTypeId ? eq(schema.teacherRemarks.examTypeId, f.examTypeId) : undefined,
              f.academicId ? eq(schema.teacherRemarks.academicId, f.academicId) : undefined,
              f.teacherId ? eq(schema.teacherRemarks.teacherId, f.teacherId) : undefined,
            ])
          ),
      "getTeacherRemarks"
    );
  }

  async queryResultData(student: StudentDetails, examId: number): Promise<QueryResultData | null> {
    return this.withErrorHandling(async () => {
      const id = student.studentId;
      const [ratings, [remark], examType, academic, marks, [attendance]] = await Promise.all([
        this.getStudentRatings({ studentId: id, examTypeId: examId }),
        this.getTeacherRemarks({ studentId: id, examTypeId: examId }),
        this.getCurrentTerm(examId),
        this.getActiveAcademicYear(),
        this.db
          .select({
            totalMarks: schema.smMarkStores.totalMarks,
            teacherRemarks: schema.smMarkStores.teacherRemarks,
            examTitle: schema.smExamSetups.examTitle,
            subjectCode: schema.smSubjects.subjectCode,
            isAbsent: schema.smMarkStores.isAbsent,
            subjectName: schema.smSubjects.subjectName,
          })
          .from(schema.smMarkStores)
          .leftJoin(schema.smSubjects, eq(schema.smMarkStores.subjectId, schema.smSubjects.id))
          .leftJoin(schema.smExamSetups, eq(schema.smMarkStores.examSetupId, schema.smExamSetups.id))
          .where(
            and(
              eq(schema.smMarkStores.studentId, id),
              eq(schema.smMarkStores.examTermId, examId),
              eq(schema.smMarkStores.activeStatus, 1)
            )
          ),
        this.db
          .select()
          .from(schema.classAttendances)
          .where(
            and(eq(schema.classAttendances.studentId, id), eq(schema.classAttendances.examTypeId, examId))
          ),
      ]);

      const { classId, sectionId } = student;
      const classResults =
        classId && sectionId
          ? await this.db
              .select()
              .from(schema.smResultStores)
              .where(
                and(
                  eq(schema.smResultStores.examTypeId, examId),
                  eq(schema.smResultStores.classId, classId),
                  eq(schema.smResultStores.sectionId, sectionId),
                  eq(schema.smResultStores.activeStatus, 1)
                )
              )
          : [];

      return { examType, academic, classResults, marks, ratings, remark, attendance };
    }, "queryResultData");
  }

  async getClassAverages(p: { classId: number; sectionId: number; examId: number }) {
    return this.withErrorHandling(
      () =>
        this.db
          .select({
            studentId: schema.smResultStores.studentId,
            average: avg(schema.smResultStores.totalMarks).as("avg_marks"),
          })
          .from(schema.smResultStores)
          .where(
            and(
              eq(schema.smResultStores.classId, p.classId),
              eq(schema.smResultStores.sectionId, p.sectionId),
              eq(schema.smResultStores.examTypeId, p.examId)
            )
          )
          .groupBy(schema.smResultStores.studentId),
      "getClassAverages"
    );
  }

  async getMarksData(p: { studentId: number; examId: number }) {
    const examMarks = jsonArrayAgg(schema.smMarkStores.totalMarks)
      .orderBy(schema.smExamSetups.id)
      .build<number[]>();

    const examTitles = jsonArrayAgg(schema.smExamSetups.examTitle)
      .distinct()
      .orderBy(schema.smExamSetups.id)
      .build<string[]>();

    return this.withErrorHandling(
      () =>
        this.db
          .select({
            subjectId: schema.smMarkStores.subjectId,
            subject: schema.smSubjects.subjectName,
            subjectCode: schema.smSubjects.subjectCode,
            titles: examTitles,
            marks: examMarks,
            totalScore: sql<number>`CAST(SUM(${schema.smMarkStores.totalMarks}) AS DECIMAL(10,2))`,
            grade: schema.smMarkStores.teacherRemarks,
          })
          .from(schema.smMarkStores)
          .leftJoin(schema.smSubjects, eq(schema.smMarkStores.subjectId, schema.smSubjects.id))
          .leftJoin(
            schema.smExamSetups,
            and(
              eq(schema.smExamSetups.id, schema.smMarkStores.examSetupId),
              eq(schema.smExamSetups.subjectId, schema.smMarkStores.subjectId)
            )
          )
          .where(
            and(eq(schema.smMarkStores.studentId, p.studentId), eq(schema.smMarkStores.examTermId, p.examId))
          )
          .groupBy(schema.smMarkStores.subjectId),
      "getMarksData"
    );
  }

  async getObjectives(_student: StudentDetail): Promise<any[]> {
    // Placeholder - requires objectives table schema
    return [];
  }

  async upsertDaycareLearningOutcome(outcome: NewLearningOutcome) {
    return this.withErrorHandling(async () => {
      const { studentId, subjectId, classId, sectionId, teacherRemarks, examTermId, schoolId, academicId } =
        outcome;
      if (!studentId || !subjectId || !classId || !sectionId || !examTermId || !schoolId || !academicId)
        return null;
      outcome;
      const [existing] = await this.db
        .select({ id: schema.smMarkStores.id })
        .from(schema.smMarkStores)
        .where(
          and(
            eq(schema.smMarkStores.studentId, studentId),
            eq(schema.smMarkStores.subjectId, subjectId),
            eq(schema.smMarkStores.classId, classId),
            eq(schema.smMarkStores.sectionId, sectionId),
            eq(schema.smMarkStores.examTermId, examTermId),
            eq(schema.smMarkStores.academicId, academicId),
            eq(schema.smMarkStores.schoolId, schoolId)
          )
        )
        .limit(1);
      if (existing) {
        await this.db
          .update(schema.smMarkStores)
          .set({ teacherRemarks })
          .where(eq(schema.learningObjectives.id, existing.id));
        return existing.id;
      }
      return (await this.db.insert(schema.smMarkStores).values(outcome).$returningId())[0].id;
    }, "upsertDaycareLearningOutcome");
  }

  async upsertStudentRatings(ratings: NewStudentRating[]): Promise<void> {
    return this.withErrorHandling(async () => {
      if (ratings.length === 0) return;

      await this.db
        .insert(schema.studentRatings)
        .values(ratings)
        .onDuplicateKeyUpdate({
          set: {
            rate: sql`VALUES(rate)`,
            attribute: sql`VALUES(attribute)`,
            color: sql`VALUES(color)`,
            remark: sql`VALUES(remark)`,
            updatedAt: new Date(),
          },
        });
    }, "upsertStudentRatings");
  }

  async upsertTeacherRemark(remark: NewTeacherRemark): Promise<void> {
    return this.withErrorHandling(
      () =>
        this.db
          .insert(schema.teacherRemarks)
          .values(remark)
          .onDuplicateKeyUpdate({ set: { remark: remark.remark, updatedAt: new Date() } })
          .then(() => {}),
      "upsertTeacherRemark"
    );
  }

  async upsertExamSetup(setup: NewExamSetup): Promise<number> {
    return this.withErrorHandling(async () => {
      const { id, createdAt, updatedAt, ...data } = setup;
      const [existing] = await this.db
        .select({ id: schema.smExamSetups.id })
        .from(schema.smExamSetups)
        .where(
          and(
            eq(schema.smExamSetups.examTitle, data.examTitle!),
            eq(schema.smExamSetups.examId, data.examId!),
            eq(schema.smExamSetups.examTermId, data.examTermId!),
            eq(schema.smExamSetups.subjectId, data.subjectId!),
            eq(schema.smExamSetups.classId, data.classId!),
            eq(schema.smExamSetups.sectionId, data.sectionId!),
            eq(schema.smExamSetups.academicId, data.academicId!)
          )
        )
        .limit(1);
      if (existing) {
        await this.db.update(schema.smExamSetups).set(data).where(eq(schema.smExamSetups.id, existing.id));
        return existing.id;
      }
      return (await this.db.insert(schema.smExamSetups).values(data).$returningId())[0].id;
    }, "upsertExamSetup");
  }

  async upsertMarkRecord(mark: NewSmMarkStore): Promise<number> {
    return this.withErrorHandling(async () => {
      const { id, createdAt, updatedAt, ...data } = mark;
      const [existing] = await this.db
        .select({ id: schema.smMarkStores.id })
        .from(schema.smMarkStores)
        .where(
          and(
            eq(schema.smMarkStores.studentId, data.studentId!),
            eq(schema.smMarkStores.examSetupId, data.examSetupId!),
            eq(schema.smMarkStores.academicId, data.academicId!)
          )
        )
        .limit(1);
      if (existing) {
        await this.db.update(schema.smMarkStores).set(data).where(eq(schema.smMarkStores.id, existing.id));
        return existing.id;
      }
      return (await this.db.insert(schema.smMarkStores).values(data).$returningId())[0].id;
    }, "upsertMarkRecord");
  }

  async upsertResultRecord(result: NewSmResultStore): Promise<number> {
    return this.withErrorHandling(async () => {
      const { id, createdAt, updatedAt, ...data } = result;
      const [existing] = await this.db
        .select({ id: schema.smResultStores.id })
        .from(schema.smResultStores)
        .where(
          and(
            eq(schema.smResultStores.studentId, data.studentId!),
            eq(schema.smResultStores.subjectId, data.subjectId!),
            eq(schema.smResultStores.examTypeId, data.examTypeId!),
            eq(schema.smResultStores.academicId, data.academicId!)
          )
        )
        .limit(1);
      if (existing) {
        await this.db
          .update(schema.smResultStores)
          .set(data)
          .where(eq(schema.smResultStores.id, existing.id));
        return existing.id;
      }
      return (await this.db.insert(schema.smResultStores).values(data).$returningId())[0].id;
    }, "upsertResultRecord");
  }

  async createExamIfNotExist(exam: NewExam): Promise<number | null> {
    const { classId, sectionId, subjectId, examTypeId, academicId, schoolId } = exam;
    if (!classId || !sectionId || !subjectId || !examTypeId || !academicId || !schoolId) return null;
    return this.withErrorHandling(async () => {
      const [existing] = await this.db
        .select()
        .from(schema.smExams)
        .where(
          and(
            eq(schema.smExams.classId, classId),
            eq(schema.smExams.sectionId, sectionId),
            eq(schema.smExams.subjectId, subjectId),
            eq(schema.smExams.examTypeId, examTypeId),
            eq(schema.smExams.academicId, academicId),
            eq(schema.smExams.schoolId, schoolId)
          )
        )
        .limit(1);
      if (existing) return existing.id;
      return (await this.db.insert(schema.smExams).values(exam).$returningId())[0].id;
    }, "createExamIfNotExist");
  }

  async getAssignedTeacher(subjectId: number, classId: number, sectionId: number) {
    return this.withErrorHandling(async () => {
      const [result] = await this.db
        .select()
        .from(schema.smAssignSubjects)
        .where(
          and(
            eq(schema.smAssignSubjects.subjectId, subjectId),
            eq(schema.smAssignSubjects.classId, classId),
            eq(schema.smAssignSubjects.sectionId, sectionId)
          )
        )
        .limit(1);
      return result;
    }, "getAssignedTeacher");
  }

  async getExamSetupsByStaffId(staffId: number): Promise<Partial<ExamSetup>[]> {
    return this.withErrorHandling(async () => {
      const [academicId, examType] = await Promise.all([this.getAcademicId(), this.getCurrentTerm()]);
      const [assigned] = await this.db
        .select()
        .from(schema.smAssignSubjects)
        .where(
          and(
            eq(schema.smAssignSubjects.teacherId, staffId),
            eq(schema.smAssignSubjects.academicId, academicId)
          )
        )
        .limit(1);
      if (!assigned) return [];
      const { classId, sectionId, subjectId } = assigned;
      if (!classId || !sectionId || !subjectId) return [];
      return this.db
        .select({
          id: schema.smExamSetups.id,
          examTitle: schema.smExamSetups.examTitle,
          exam_mark: schema.smExamSetups.examMark,
          classId: schema.smExamSetups.classId,
          sectionId: schema.smExamSetups.sectionId,
        })
        .from(schema.smExamSetups)
        .where(
          and(
            eq(schema.smExamSetups.classId, classId),
            eq(schema.smExamSetups.sectionId, sectionId),
            eq(schema.smExamSetups.subjectId, subjectId),
            eq(schema.smExamSetups.examTermId, examType.id),
            eq(schema.smExamSetups.academicId, academicId)
          )
        );
    }, "getExamSetupsByStaffId");
  }

  async getExamSetup(p: GetExamSetupParams): Promise<ExamSetup[]> {
    return this.withErrorHandling(
      () =>
        this.db
          .select()
          .from(schema.smExamSetups)
          .where(
            and(
              eq(schema.smExamSetups.classId, p.studentClassId),
              eq(schema.smExamSetups.sectionId, p.studentSectionId),
              eq(schema.smExamSetups.examTermId, p.examTypeId),
              eq(schema.smExamSetups.academicId, p.academicId),
              eq(schema.smExamSetups.schoolId, p.schoolId)
            )
          ),
      "getExamSetup"
    );
  }

  async getSubjectFullMark(p: GetSubjectFullMarkParams): Promise<number> {
    return this.withErrorHandling(async () => {
      const [r] = await this.db
        .select({ totalMark: schema.smMarkStores.totalMarks })
        .from(schema.smMarkStores)
        .where(
          and(
            eq(schema.smMarkStores.examTermId, p.examTypeId),
            eq(schema.smMarkStores.subjectId, p.subjectId),
            eq(schema.smMarkStores.classId, p.classId),
            eq(schema.smMarkStores.sectionId, p.sectionId),
            eq(schema.smMarkStores.academicId, p.academicId),
            eq(schema.smMarkStores.schoolId, p.schoolId)
          )
        )
        .limit(1);
      return r?.totalMark || 0;
    }, "getSubjectFullMark");
  }

  async getMarkGrade(p: GetMarkGradeParams): Promise<{ gradeName: string; gpa: number }[]> {
    return this.withErrorHandling(async () => {
      const results = await this.db
        .select({ gradeName: schema.smMarksGrades.gradeName, gpa: schema.smMarksGrades.gpa })
        .from(schema.smMarksGrades)
        .where(
          and(
            sql`${p.percentage} BETWEEN ${schema.smMarksGrades.percentFrom} AND ${schema.smMarksGrades.percentUpto}`,
            eq(schema.smMarksGrades.academicId, p.academicId),
            eq(schema.smMarksGrades.schoolId, p.schoolId)
          )
        );
      return results.filter(
        (r): r is { gradeName: string; gpa: number } => r.gradeName != null && r.gpa != null
      );
    }, "getMarkGrade");
  }

  async getStudentCategories(): Promise<Partial<StudentCategory>[]> {
    return this.withErrorHandling(async () => {
      return this.db
        .select({ id: schema.smStudentCategories.id, categoryName: schema.smStudentCategories.categoryName })
        .from(schema.smStudentCategories)
        .orderBy(asc(schema.smStudentCategories.categoryName));
    }, "getStudentCategories");
  }

  async getAssignedSubjects(staffId: number): Promise<Partial<Subject>[]> {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const subjects = await this.db
        .select({ id: schema.smSubjects.id, subjectCode: schema.smSubjects.subjectCode })
        .from(schema.smSubjects)
        .leftJoin(schema.smAssignSubjects, eq(schema.smSubjects.id, schema.smAssignSubjects.subjectId))
        .where(
          and(
            eq(schema.smAssignSubjects.teacherId, staffId),
            eq(schema.smAssignSubjects.academicId, academicId),
            eq(schema.smSubjects.activeStatus, 1)
          )
        )
        .orderBy(asc(schema.smSubjects.subjectName));
      return subjects;
    }, "getAssignedSubjects");
  }
}

export const resultRepo = await ResultsRepository.build();
