import * as schema from "$lib/server/db/schema";
import { and, avg, eq, asc, sql, inArray } from "drizzle-orm";
import { BaseRepository, type MySQLDrizzleClient } from "./base.repo";
import { type StudentDetails } from "./student.repo";
import type {
  AssignedSubject,
  ClassSection,
  ExamSetup,
  GetExamSetup,
  GetMarkGradeParams,
  GetSubjectFullMarkParams,
  MarkData,
  NewAttendance,
  NewExam,
  NewExamSetup,
  NewLearningOutcome,
  NewSmMarkStore,
  NewSmResultStore,
  NewStudentRating,
  NewTeacherRemark,
  QueryResultData,
  StudentCategory,
  Subject,
} from "$lib/types/result-types";
import { jsonArrayAgg } from "../helpers";
import type { Rating, Remark, Student, SubjectAssigned } from "$lib/schema/result-output";

export class ResultsRepository extends BaseRepository {
  async assignSubjects(assigned: Partial<AssignedSubject>[]) {
    return this.withErrorHandling(async () => {
      const ids = await this.db.insert(schema.smAssignSubjects).values(assigned).$returningId();
      return ids.length > 0;
    }, "upsertAssignSubject");
  }

  getClassSections(): Promise<ClassSection[]> {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      return await this.db
        .select({
          id: schema.smClassSections.id,
          classId: schema.smClassSections.classId,
          className: schema.smClasses.className,
          sectionId: schema.smClassSections.sectionId,
          sectionName: schema.smSections.sectionName,
        })
        .from(schema.smClassSections)
        .leftJoin(schema.smClasses, eq(schema.smClassSections.classId, schema.smClasses.id))
        .leftJoin(schema.smSections, eq(schema.smClassSections.sectionId, schema.smSections.id))
        .where(
          and(
            eq(schema.smClassSections.activeStatus, 1),
            eq(schema.smClasses.activeStatus, 1),
            eq(schema.smSections.activeStatus, 1),
            eq(schema.smClassSections.academicId, academicId)
          )
        )
        .orderBy(asc(schema.smClassSections.classId));
    }, "getClassSections");
  }

  async getClassSectionById(classId: number, sectionId: number): Promise<ClassSection | null> {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const [classSection] = await this.db
        .select({
          id: schema.smClassSections.id,
          classId: schema.smClassSections.classId,
          className: schema.smClasses.className,
          sectionId: schema.smClassSections.sectionId,
          sectionName: schema.smSections.sectionName,
        })
        .from(schema.smClassSections)
        .leftJoin(schema.smClasses, eq(schema.smClassSections.classId, schema.smClasses.id))
        .leftJoin(schema.smSections, eq(schema.smClassSections.sectionId, schema.smSections.id))
        .where(
          and(
            eq(schema.smClassSections.classId, classId),
            eq(schema.smClassSections.sectionId, sectionId),
            eq(schema.smClassSections.activeStatus, 1),
            eq(schema.smClassSections.academicId, academicId)
          )
        )
        .limit(1);
      return classSection || null;
    }, "getClassSectionById");
  }

  async getAssignedSubjects(classId: number, sectionId: number): Promise<SubjectAssigned[]> {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const [assigned] = await this.db
        .select()
        .from(schema.smAssignSubjects)
        .where(
          and(
            eq(schema.smAssignSubjects.classId, classId),
            eq(schema.smAssignSubjects.sectionId, sectionId),
            eq(schema.smAssignSubjects.academicId, academicId)
          )
        )
        .groupBy(schema.smAssignSubjects.teacherId)
        .limit(1);
      if (!assigned || !assigned.teacherId) return [];
      return await this.db
        .select({
          subjectId: schema.smAssignSubjects.subjectId,
          subjectCode: schema.smSubjects.subjectCode,
          teacherId: schema.smAssignSubjects.teacherId,
        })
        .from(schema.smAssignSubjects)
        .leftJoin(schema.smSubjects, eq(schema.smAssignSubjects.subjectId, schema.smSubjects.id))
        .where(
          and(
            eq(schema.smAssignSubjects.classId, classId),
            eq(schema.smAssignSubjects.sectionId, sectionId),
            eq(schema.smAssignSubjects.teacherId, assigned.teacherId),
            eq(schema.smAssignSubjects.academicId, academicId)
          )
        )
        .groupBy(schema.smAssignSubjects.subjectId);
    }, "getAssignedSubjects");
  }

  async getAssignedClassSection(staffId: number) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const [classSection] = await this.db
        .select({
          id: schema.smClassSections.id,
          classId: schema.smAssignSubjects.classId,
          className: schema.smClasses.className,
          sectionId: schema.smAssignSubjects.sectionId,
          sectionName: schema.smSections.sectionName,
        })
        .from(schema.smAssignSubjects)
        .leftJoin(schema.smClasses, eq(schema.smAssignSubjects.classId, schema.smClasses.id))
        .leftJoin(schema.smSections, eq(schema.smAssignSubjects.sectionId, schema.smSections.id))
        .leftJoin(
          schema.smClassSections,
          and(
            eq(schema.smClassSections.classId, schema.smAssignSubjects.classId),
            eq(schema.smClassSections.sectionId, schema.smAssignSubjects.sectionId),
            eq(schema.smClassSections.academicId, academicId)
          )
        )
        .where(
          and(
            eq(schema.smAssignSubjects.teacherId, staffId),
            eq(schema.smAssignSubjects.activeStatus, 1),
            eq(schema.smAssignSubjects.academicId, academicId)
          )
        )
        .limit(1);
      return classSection as any as ClassSection | null;
    }, "getAssignedClassSection");
  }

  async upsertClassAttendance(attendance: NewAttendance, tx?: MySQLDrizzleClient) {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const { id, createdAt, updatedAt, ...data } = attendance;
      const academicId = await this.getAcademicId();
      // Update data to include academicId from the current context
      const updatedData = {
        ...data,
        academicId,
      };

      // Look for existing record based on the unique constraint (studentId, examTypeId)
      const [existing] = await db
        .select({ id: schema.classAttendances.id })
        .from(schema.classAttendances)
        .where(
          and(
            eq(schema.classAttendances.studentId, data.studentId!),
            eq(schema.classAttendances.examTypeId, data.examTypeId!)
          )
        )
        .limit(1);
      if (existing) {
        await db
          .update(schema.classAttendances)
          .set(updatedData)
          .where(eq(schema.classAttendances.id, existing.id));
        return existing.id;
      }
      return (await db.insert(schema.classAttendances).values(updatedData).$returningId())[0].id;
    }, "upsertClassAttendance");
  }

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

  async deleteResultStore(resultId: number, studentId: number) {
    return this.withErrorHandling(async () => {
      await this.db.delete(schema.smResultStores).where(
        and(
          eq(schema.smResultStores.id, resultId),
          eq(schema.smResultStores.studentId, studentId))
      );
    }, "deleteResultStore");
  }

  async deleteMarkStore(markIds: number[], studentId: number) {
    return this.withErrorHandling(async () => {
      await this.db.delete(schema.smMarkStores).where(
        and(
          inArray(schema.smMarkStores.id, markIds),
          eq(schema.smMarkStores.studentId, studentId))
      );
    }, "deleteMarkStore");
  }

  async cleanMarks(params: {
    recordId: number;
    studentId: number;
    classId: number;
    sectionId: number;
    examTermId: number;
    schoolId: number;
  }, tx?: MySQLDrizzleClient) {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const { recordId, studentId, classId, sectionId, examTermId, schoolId } = params;
      const academicId = await this.getAcademicId();

      // Delete result records from smResultStores
      const resultStores = await db
        .select({ id: schema.smResultStores.id })
        .from(schema.smResultStores)
        .where(
          and(
            eq(schema.smResultStores.studentRecordId, recordId),
            eq(schema.smResultStores.studentId, studentId),
            eq(schema.smResultStores.classId, classId),
            eq(schema.smResultStores.sectionId, sectionId),
            eq(schema.smResultStores.examTypeId, examTermId),
            eq(schema.smResultStores.schoolId, schoolId),
            eq(schema.smResultStores.academicId, academicId)
          )
        )
      if (resultStores.length > 0) {
        await db
          .delete(schema.smResultStores)
          .where(inArray(schema.smResultStores.id, resultStores.map((rs: { id: number }) => rs.id)));
      }

      // Select marks from smMarkStores
      const marks = await db
        .select({
          id: schema.smMarkStores.id,
          setupId: schema.smMarkStores.examSetupId,
        })
        .from(schema.smMarkStores)
        .where(
          and(
            eq(schema.smMarkStores.studentRecordId, recordId),
            eq(schema.smMarkStores.studentId, studentId),
            eq(schema.smMarkStores.classId, classId),
            eq(schema.smMarkStores.sectionId, sectionId),
            eq(schema.smMarkStores.examTermId, examTermId),
            eq(schema.smMarkStores.schoolId, schoolId),
            eq(schema.smMarkStores.academicId, academicId)
          )
        );

      if (marks.length === 0) return;

      // Delete marks from smMarkStores
      await db
        .delete(schema.smMarkStores)
        .where(inArray(schema.smMarkStores.id, marks.map((m: { id: number }) => m.id)));
    }, "cleanMarks");
  }

  async deleteExamSetup(titleIds: number[]) {
    return this.withErrorHandling(async () => {
      await this.db.delete(schema.smExamSetups).where(inArray(schema.smExamSetups.id, titleIds));
    }, "deleteExamSetup");
  }

  async queryResultData(student: StudentDetails, examId: number): Promise<QueryResultData | null> {
    return this.withErrorHandling(async () => {
      const id = student.studentId;

      const [ratings, [remark], examType, academic, resultRecords, marks, [attendance]] = await Promise.all([
        this.getStudentRatings({ studentId: id, examTypeId: examId }),
        this.getTeacherRemarks({ studentId: id, examTypeId: examId }),
        this.getCurrentTerm(examId),
        this.getActiveAcademicYear(),
        // Query 1: Fetch all result records from smResultStores (one per subject)
        this.db
          .select({
            studentId: schema.smResultStores.studentId,
            resultId: schema.smResultStores.id,
            subjectId: schema.smResultStores.subjectId,
            subjectName: schema.smSubjects.subjectName,
            subjectCode: schema.smSubjects.subjectCode,
            teacherRemarks: schema.smResultStores.teacherRemarks,
          })
          .from(schema.smResultStores)
          .leftJoin(schema.smSubjects, eq(schema.smResultStores.subjectId, schema.smSubjects.id))
          .where(
            and(
              eq(schema.smResultStores.studentId, id),
              eq(schema.smResultStores.examTypeId, examId),
              eq(schema.smResultStores.activeStatus, 1)
            )
          ),
        // Query 2: Fetch marks from smMarkStores
        this.db
          .select({
            studentId: schema.smMarkStores.studentId,
            markId: schema.smMarkStores.id,
            subjectId: schema.smSubjects.id,
            totalMarks: schema.smMarkStores.totalMarks,
            examTitle: schema.smExamSetups.examTitle,
            examMark: schema.smExamSetups.examMark,
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
        // Query 3: Fetch attendance from classAttendances
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

      return {
        examType,
        academic,
        classResults,
        marks,
        resultRecords,
        ratings,
        remark,
        attendance,
      };
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

  async getObjectives(_student: Student): Promise<any[]> {
    // Placeholder - requires objectives table schema
    return [];
  }

  async upsertDaycareLearningOutcome(outcome: NewLearningOutcome, tx?: MySQLDrizzleClient) {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const { studentId, subjectId, classId, sectionId, teacherRemarks, examTermId, schoolId, academicId } =
        outcome;
      if (!studentId || !subjectId || !classId || !sectionId || !examTermId || !schoolId || !academicId)
        return null;
      outcome;
      const [existing] = await db
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
        await db
          .update(schema.smMarkStores)
          .set({ teacherRemarks })
          .where(eq(schema.smMarkStores.id, existing.id));
        return existing.id;
      }
      return (await db.insert(schema.smMarkStores).values(outcome).$returningId())[0].id;
    }, "upsertDaycareLearningOutcome");
  }

  async upsertStudentRatings(ratings: NewStudentRating[], tx?: MySQLDrizzleClient): Promise<void> {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      if (ratings.length === 0) return;

      await db
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

  async upsertTeacherRemark(remark: NewTeacherRemark, tx?: MySQLDrizzleClient): Promise<void> {
    await this.withErrorHandling(
      async () => {
        const db = tx || this.db;
        await db
          .insert(schema.teacherRemarks)
          .values(remark)
          .onDuplicateKeyUpdate({ set: { remark: remark.remark, updatedAt: new Date() } });
      },
      "upsertTeacherRemark"
    );
  }

  async updateExamSetup(params: {
    classId: number;
    sectionId: number;
    examTermId: number;
    schoolId: number;
    examTitles: string[];
  }): Promise<number> {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const { classId, sectionId, examTermId, schoolId, ...data } = params;
      const result = await this.db
        .update(schema.smExamSetups)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(schema.smExamSetups.classId, classId),
            eq(schema.smExamSetups.sectionId, sectionId),
            eq(schema.smExamSetups.examTermId, examTermId),
            eq(schema.smExamSetups.academicId, academicId),
            eq(schema.smExamSetups.schoolId, schoolId)
          )
        );
      return Number(result[0].affectedRows);
    }, "updateExamSetupTitle");
  }

  async upsertExamSetup(setup: NewExamSetup, tx?: MySQLDrizzleClient): Promise<number> {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const { id, createdAt, updatedAt, ...data } = setup;
      const [existing] = await db
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
        await db.update(schema.smExamSetups).set(data).where(eq(schema.smExamSetups.id, existing.id));
        return existing.id;
      }
      return (await db.insert(schema.smExamSetups).values(data).$returningId())[0].id;
    }, "upsertExamSetup");
  }

  async batchUpsertMarkRecords(marks: NewSmMarkStore[], tx?: MySQLDrizzleClient): Promise<void> {
    await this.withErrorHandling(async () => {
      const db = tx || this.db;
      if (marks.length === 0) return;
      await db
        .insert(schema.smMarkStores)
        .values(marks)
        .onDuplicateKeyUpdate({
          set: {
            totalMarks: sql`VALUES(total_marks)`,
            isAbsent: sql`VALUES(is_absent)`,
            teacherRemarks: sql`VALUES(teacher_remarks)`,
            updatedAt: new Date(),
          },
        });
    }, "batchUpsertMarkRecords");
  }

  async batchUpsertResultRecords(results: NewSmResultStore[], tx?: MySQLDrizzleClient): Promise<void> {
    await this.withErrorHandling(async () => {
      const db = tx || this.db;
      if (results.length === 0) return;
      await db
        .insert(schema.smResultStores)
        .values(results)
        .onDuplicateKeyUpdate({
          set: {
            totalMarks: sql`VALUES(total_marks)`, // fixed column name
            teacherRemarks: sql`VALUES(teacher_remarks)`,
            updatedAt: new Date(),
          },
        });
    }, "batchUpsertResultRecords");
  }


  async createExamIfNotExist(exam: NewExam, tx?: MySQLDrizzleClient): Promise<number | null> {
    const { classId, sectionId, subjectId, examTypeId, academicId, schoolId } = exam;
    if (!classId || !sectionId || !subjectId || !examTypeId || !academicId || !schoolId) return null;
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const [existing] = await db
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
      return (await db.insert(schema.smExams).values(exam).$returningId())[0].id;
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
      const academicId = await this.getAcademicId();
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
      const { classId, sectionId } = assigned;
      if (!classId || !sectionId) return [];
      return this.getExamSetupsByClassSection(classId, sectionId);
    }, "getExamSetupsByStaffId");
  }

  async getExamSetupsByClassSection(classId: number, sectionId: number): Promise<Partial<ExamSetup>[]> {
    return this.withErrorHandling(async () => {
      const [academicId, examType] = await Promise.all([this.getAcademicId(), this.getCurrentTerm()]);
      return this.db
        .select({
          id: schema.smExamSetups.id,
          examTitle: schema.smExamSetups.examTitle,
          classId: schema.smExamSetups.classId,
          sectionId: schema.smExamSetups.sectionId,
          subjectId: schema.smExamSetups.subjectId,
          examId: schema.smExamSetups.examId,
        })
        .from(schema.smExamSetups)
        .where(
          and(
            eq(schema.smExamSetups.classId, classId),
            eq(schema.smExamSetups.sectionId, sectionId),
            eq(schema.smExamSetups.examTermId, examType.id),
            eq(schema.smExamSetups.academicId, academicId)
          )
        );
    }, "getExamSetupsByClassSection");
  }

  async getExamSetup(p: GetExamSetup): Promise<ExamSetup[]> {
    const { classId, sectionId, subjectId, examTypeId, schoolId } = p;
    const condition = subjectId ? eq(schema.smExamSetups.subjectId, subjectId) : undefined;
    const academicId = await this.getAcademicId();
    return this.withErrorHandling(
      () =>
        this.db
          .select()
          .from(schema.smExamSetups)
          .where(
            and(
              eq(schema.smExamSetups.classId, classId),
              eq(schema.smExamSetups.sectionId, sectionId),
              eq(schema.smExamSetups.examTermId, examTypeId),
              eq(schema.smExamSetups.academicId, academicId),
              eq(schema.smExamSetups.schoolId, schoolId),
              condition
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
        (r: any): r is { gradeName: string; gpa: number } => r.gradeName != null && r.gpa != null
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

  async getSubjectsAssignedToStaff(staffId: number): Promise<Partial<Subject>[]> {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const subjects = await this.db
        .select({ id: schema.smSubjects.id, subjectCode: schema.smSubjects.subjectCode, subjectName: schema.smSubjects.subjectName })
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

// export const resultRepo = await ResultsRepository.build();
