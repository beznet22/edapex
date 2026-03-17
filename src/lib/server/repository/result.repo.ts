// /src/lib/server/repository/result.repo.ts

import { and, avg, eq, asc, sql, inArray, desc, like } from "drizzle-orm";
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
import { 
  exams, 
  examSetups, 
  examMarks, 
  computedResults, 
  grades, 
  studentRatings, 
  teacherRemarks, 
  classAttendances 
} from "$lib/server/db/domain-assessment";
import { 
  classes, 
  sections, 
  subjects, 
  subjectAssignments, 
  classSections,
  classTeachers
} from "$lib/server/db/domain-academic";
import { academicYears, enumerations } from "$lib/server/db/domain-core";
import { settings } from "$lib/server/db/domain-settings";

export class ResultsRepository extends BaseRepository {
  async assignSubjects(assigned: any[]) {
    return this.withErrorHandling(async () => {
      // Logic for batch assigning subjects
      for (const item of assigned) {
        await this.db.insert(subjectAssignments).values({
          tenantId: item.schoolId || 1,
          staffId: item.teacherId,
          classId: item.classId,
          sectionId: item.sectionId,
          subjectId: item.subjectId,
          academicId: item.academicId,
        });
      }
      return true;
    }, "assignSubjects");
  }

  getClassSections(): Promise<ClassSection[]> {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      return await this.db
        .select({
          id: classSections.id,
          classId: classSections.classId,
          className: classes.name,
          sectionId: classSections.sectionId,
          sectionName: sections.name,
        })
        .from(classSections)
        .leftJoin(classes, eq(classSections.classId, classes.id))
        .leftJoin(sections, eq(classSections.sectionId, sections.id))
        .where(
          and(
            eq(classes.activeStatus, 1),
            eq(sections.activeStatus, 1),
            eq(classSections.academicId, academicId)
          )
        )
        .orderBy(asc(classSections.classId));
    }, "getClassSections");
  }

  async getClassSectionById(classId: number, sectionId: number): Promise<ClassSection | null> {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const [cs] = await this.db
        .select({
          id: classSections.id,
          classId: classSections.classId,
          className: classes.name,
          sectionId: classSections.sectionId,
          sectionName: sections.name,
        })
        .from(classSections)
        .leftJoin(classes, eq(classSections.classId, classes.id))
        .leftJoin(sections, eq(classSections.sectionId, sections.id))
        .where(
          and(
            eq(classSections.classId, classId),
            eq(classSections.sectionId, sectionId),
            eq(classSections.academicId, academicId)
          )
        )
        .limit(1);
      return cs || null;
    }, "getClassSectionById");
  }

  async getCurrentTerm() {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const [exam] = await this.db
        .select()
        .from(exams)
        .where(and(eq(exams.academicId, academicId), eq(exams.activeStatus, 1)))
        .limit(1);
      return exam;
    }, "getCurrentTerm");
  }

  async getStudentCategories() {
    return this.withErrorHandling(async () => {
      return await this.db
        .select({ id: enumerations.id, name: enumerations.label })
        .from(enumerations)
        .where(eq(enumerations.domain, "student_category"));
    }, "getStudentCategories");
  }

  async getSubjectsAssignedToStaff(staffId: number) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      return await this.db
        .select({
          id: subjects.id,
          name: subjects.name,
          code: subjects.code,
        })
        .from(subjectAssignments)
        .innerJoin(subjects, eq(subjectAssignments.subjectId, subjects.id))
        .where(
          and(
            eq(subjectAssignments.staffId, staffId),
            eq(subjectAssignments.academicId, academicId)
          )
        );
    }, "getSubjectsAssignedToStaff");
  }

  async getGeneralSettings() {
    return this.withErrorHandling(async () => {
      return await this.db
        .select()
        .from(settings)
        .where(eq(settings.domain, "general"));
    }, "getGeneralSettings");
  }

  async getAssignedClassSection(staffId: number) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const [cs] = await this.db
        .select({
          id: classSections.id,
          classId: classTeachers.classId,
          className: classes.name,
          sectionId: classTeachers.sectionId,
          sectionName: sections.name,
        })
        .from(classTeachers)
        .leftJoin(classes, eq(classTeachers.classId, classes.id))
        .leftJoin(sections, eq(classTeachers.sectionId, sections.id))
        .leftJoin(
          classSections,
          and(
            eq(classSections.classId, classTeachers.classId),
            eq(classSections.sectionId, classTeachers.sectionId),
            eq(classSections.academicId, academicId)
          )
        )
        .where(
          and(
            eq(classTeachers.staffId, staffId),
            eq(classTeachers.academicId, academicId)
          )
        )
        .limit(1);
      return cs as any as ClassSection | null;
    }, "getAssignedClassSection");
  }

  async getAssignedSubjects(classId: number, sectionId: number): Promise<SubjectAssigned[]> {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const results = await this.db
        .select({
          subjectId: subjectAssignments.subjectId,
          subjectCode: subjects.code,
          teacherId: subjectAssignments.staffId,
        })
        .from(subjectAssignments)
        .leftJoin(subjects, eq(subjectAssignments.subjectId, subjects.id))
        .where(
          and(
            eq(subjectAssignments.classId, classId),
            eq(subjectAssignments.sectionId, sectionId),
            eq(subjectAssignments.academicId, academicId)
          )
        );
      return results as any[];
    }, "getAssignedSubjects");
  }

  async upsertClassAttendance(attendance: any, tx?: MySQLDrizzleClient) {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const academicId = await this.getAcademicId();

      const [existing] = await db
        .select({ id: classAttendances.id })
        .from(classAttendances)
        .where(
          and(
            eq(classAttendances.userId, attendance.studentId),
            eq(classAttendances.examId, attendance.examTypeId)
          )
        )
        .limit(1);
      
      if (existing) {
        await db
          .update(classAttendances)
          .set({
            daysOpened: attendance.daysOpened,
            daysAbsent: attendance.daysAbsent,
            daysPresent: attendance.daysPresent,
            updatedAt: new Date(),
          })
          .where(eq(classAttendances.id, existing.id));
        return existing.id;
      }
      
      const [inserted] = await db.insert(classAttendances).values({
        tenantId: this.tenant.tenantId,
        userId: attendance.studentId,
        examId: attendance.examTypeId,
        daysOpened: attendance.daysOpened,
        daysAbsent: attendance.daysAbsent,
        daysPresent: attendance.daysPresent,
        academicId,
      });
      return (inserted as any).insertId;
    }, "upsertClassAttendance");
  }

  async getStudentRatings(f: {
    studentId?: number;
    examTypeId?: number;
    academicId?: number;
  }): Promise<Rating> {
    return this.withErrorHandling(
      async () => {
        const filters = [];
        if (f.studentId) filters.push(eq(studentRatings.userId, f.studentId));
        if (f.examTypeId) filters.push(eq(studentRatings.examId, f.examTypeId));
        if (f.academicId) filters.push(eq(studentRatings.academicId, f.academicId));

        return await this.db
          .select({
            attribute: studentRatings.attribute,
            rate: studentRatings.rate,
            color: studentRatings.color,
            remark: studentRatings.remark,
          })
          .from(studentRatings)
          .where(and(...filters));
      },
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
      async () => {
        const filters = [];
        if (f.studentId) filters.push(eq(teacherRemarks.userId, f.studentId));
        if (f.examTypeId) filters.push(eq(teacherRemarks.examId, f.examTypeId));
        if (f.academicId) filters.push(eq(teacherRemarks.academicId, f.academicId));
        if (f.teacherId) filters.push(eq(teacherRemarks.staffId, f.teacherId));

        return await this.db
          .select({ remark: teacherRemarks.remark })
          .from(teacherRemarks)
          .where(and(...filters));
      },
      "getTeacherRemarks"
    );
  }

  async deleteResultStore(resultId: number, studentId: number) {
    return this.withErrorHandling(async () => {
      await this.db.delete(computedResults).where(
        and(
          eq(computedResults.id, resultId),
          eq(computedResults.userId, studentId))
      );
    }, "deleteResultStore");
  }

  async deleteMarkStore(markIds: number[], studentId: number) {
    return this.withErrorHandling(async () => {
      await this.db.delete(examMarks).where(
        and(
          inArray(examMarks.id, markIds),
          eq(examMarks.userId, studentId))
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
      const { studentId, classId, sectionId, examTermId } = params;
      const academicId = await this.getAcademicId();

      await db.delete(computedResults).where(and(
        eq(computedResults.userId, studentId),
        eq(computedResults.examId, examTermId),
        eq(computedResults.classId, classId),
        eq(computedResults.sectionId, sectionId),
        eq(computedResults.academicId, academicId)
      ));

      // Marks cleanup
      const setups = await db.select({ id: examSetups.id }).from(examSetups).where(and(
        eq(examSetups.examId, examTermId),
        eq(examSetups.classId, classId),
        eq(examSetups.sectionId, sectionId)
      ));
      
      if (setups.length > 0) {
        await db.delete(examMarks).where(and(
          eq(examMarks.userId, studentId),
          inArray(examMarks.examSetupId, setups.map(s => s.id))
        ));
      }
    }, "cleanMarks");
  }

  async deleteExamSetup(ids: number[]) {
    return this.withErrorHandling(async () => {
      await this.db.delete(examSetups).where(inArray(examSetups.id, ids));
    }, "deleteExamSetup");
  }

  async getExamSetupsByClassSection(classId: number, sectionId: number) {
    return this.withErrorHandling(async () => {
      return await this.db
        .select()
        .from(examSetups)
        .where(and(eq(examSetups.classId, classId), eq(examSetups.sectionId, sectionId)));
    }, "getExamSetupsByClassSection");
  }

  async getExamSetupsByStaffId(staffId: number) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      return await this.db
        .select({
          id: examSetups.id,
          tenantId: examSetups.tenantId,
          examId: examSetups.examId,
          classId: examSetups.classId,
          sectionId: examSetups.sectionId,
          subjectId: examSetups.subjectId,
          examMark: examSetups.examMark,
          createdAt: examSetups.createdAt,
          updatedAt: examSetups.updatedAt,
        })
        .from(subjectAssignments)
        .innerJoin(examSetups, eq(subjectAssignments.subjectId, examSetups.subjectId))
        .where(
          and(
            eq(subjectAssignments.staffId, staffId),
            eq(subjectAssignments.academicId, academicId)
          )
        );
    }, "getExamSetupsByStaffId");
  }

  async getExamSetup(examId: number, classId: number, sectionId: number, subjectId: number) {
    return this.withErrorHandling(async () => {
      const [setup] = await this.db
        .select({
          id: examSetups.id,
          tenantId: examSetups.tenantId,
          examId: examSetups.examId,
          classId: examSetups.classId,
          sectionId: examSetups.sectionId,
          subjectId: examSetups.subjectId,
          examMark: examSetups.examMark,
          examTitle: exams.title,
          createdAt: examSetups.createdAt,
          updatedAt: examSetups.updatedAt,
        })
        .from(examSetups)
        .innerJoin(exams, eq(examSetups.examId, exams.id))
        .where(
          and(
            eq(examSetups.examId, examId),
            eq(examSetups.classId, classId),
            eq(examSetups.sectionId, sectionId),
            eq(examSetups.subjectId, subjectId)
          )
        )
        .limit(1);
      return setup;
    }, "getExamSetup");
  }

  async getObjectives(classId: number, sectionId: number, examId: number, subjectId: number) {
    return [];
  }

  async createExamIfNotExist(payload: any, tx?: MySQLDrizzleClient) {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const [existing] = await db
        .select({ id: exams.id })
        .from(exams)
        .where(
          and(
            eq(exams.title, payload.title || "Term Result"),
            eq(exams.academicId, payload.academicId),
            eq(exams.examType, "term")
          )
        )
        .limit(1);

      if (existing) return existing.id;
      const [res] = await db.insert(exams).values({
        tenantId: payload.tenantId,
        examType: "term",
        title: payload.title || "Term Result",
        academicId: payload.academicId,
        activeStatus: 1,
      }).$returningId();
      return res?.id;
    }, "createExamIfNotExist");
  }

  async queryResultData(student: StudentDetails, examId: number): Promise<QueryResultData | null> {
    return this.withErrorHandling(async () => {
      const id = student.studentId;
      const academicId = await this.getAcademicId();

      const [ratings, [remark], examType, [academic], resultRecords, marks, [attendance]] = await Promise.all([
        this.getStudentRatings({ studentId: id, examTypeId: examId }),
        this.getTeacherRemarks({ studentId: id, examTypeId: examId }),
        this.db.select().from(exams).where(eq(exams.id, examId)).limit(1).then(r => r[0]),
        this.db.select().from(academicYears).where(eq(academicYears.id, academicId)).limit(1),
        
        this.db
          .select({
            studentId: computedResults.userId,
            resultId: computedResults.id,
            subjectId: sql<number | null>`NULL`,
            subjectName: sql<string | null>`NULL`,
            subjectCode: sql<string | null>`NULL`,
            teacherRemarks: computedResults.teacherRemarks,
          })
          .from(computedResults)
          .where(
            and(
              eq(computedResults.userId, id),
              eq(computedResults.examId, examId)
            )
          ),
          
        this.db
          .select({
            studentId: examMarks.userId,
            markId: examMarks.id,
            subjectId: examSetups.subjectId,
            totalMarks: examMarks.totalMarks,
            examTitle: exams.title,
            examMark: examSetups.examMark,
            subjectCode: subjects.code,
            isAbsent: examMarks.isAbsent,
            subjectName: subjects.name,
          })
          .from(examMarks)
          .innerJoin(examSetups, eq(examMarks.examSetupId, examSetups.id))
          .innerJoin(subjects, eq(examSetups.subjectId, subjects.id))
          .innerJoin(exams, eq(examSetups.examId, exams.id))
          .where(
            and(
              eq(examMarks.userId, id),
              eq(exams.id, examId)
            )
          ),

        this.db
          .select()
          .from(classAttendances)
          .where(
            and(eq(classAttendances.userId, id), eq(classAttendances.examId, examId))
          ),
      ]);

      const { classId, sectionId } = student;
      const classResults =
        classId && sectionId
          ? await this.db
            .select()
            .from(computedResults)
            .where(
              and(
                eq(computedResults.examId, examId),
                eq(computedResults.classId, classId),
                eq(computedResults.sectionId, sectionId)
              )
            )
          : [];

      return {
        examType: examType as any,
        academic: academic as any,
        classResults: classResults as any[],
        marks: marks as any[],
        resultRecords: resultRecords as any[],
        ratings: ratings as any,
        remark: remark as any,
        attendance: attendance as any,
      };
    }, "queryResultData");
  }

  async getClassAverages(classResults: any[]) {
    return this.withErrorHandling(async () => {
      // Simplification based on memory context
      const byStudent: Record<number, number> = {};
      classResults.forEach(r => {
        if (r.userId) {
          byStudent[r.userId] = (byStudent[r.userId] || 0) + Number(r.totalMarks || 0);
        }
      });
      
      const students = Object.keys(byStudent).map(Number);
      if (students.length === 0) return { min: { value: "0" }, max: { value: "0" } };
      
      const values = Object.values(byStudent);
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      return {
        min: { value: min.toString() },
        max: { value: max.toString() },
      };
    }, "getClassAverages");
  }

  async getMarksData(p: { studentId: number; examId: number }) {
    return this.withErrorHandling(
      async () => {
        const results = await this.db
          .select({
            subjectId: examSetups.subjectId,
            subject: subjects.name,
            subjectCode: subjects.code,
            totalScore: sql<number>`SUM(${examMarks.totalMarks})`,
            grade: examMarks.teacherRemarks,
          })
          .from(examMarks)
          .innerJoin(examSetups, eq(examMarks.examSetupId, examSetups.id))
          .innerJoin(subjects, eq(examSetups.subjectId, subjects.id))
          .where(
            and(eq(examMarks.userId, p.studentId), eq(examSetups.examId, p.examId))
          )
          .groupBy(examSetups.subjectId);
        
        return results;
      },
      "getMarksData"
    );
  }

  async upsertStudentRatings(ratings: any[], tx?: MySQLDrizzleClient): Promise<void> {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      for (const r of ratings) {
        await db.insert(studentRatings).values({
          tenantId: this.tenant.tenantId,
          userId: r.studentId,
          examId: r.examTypeId,
          attribute: r.attribute,
          rate: r.rate,
          color: r.color,
          remark: r.remark,
          academicId: r.academicId,
        }).onDuplicateKeyUpdate({
          set: {
            rate: r.rate,
            remark: r.remark,
            updatedAt: new Date(),
          }
        });
      }
    }, "upsertStudentRatings");
  }

  async upsertTeacherRemark(remark: any, tx?: MySQLDrizzleClient): Promise<void> {
    await this.withErrorHandling(async () => {
      const db = tx || this.db;
      await db.insert(teacherRemarks).values({
        tenantId: this.tenant.tenantId,
        userId: remark.studentId,
        examId: remark.examTypeId,
        staffId: remark.teacherId,
        remark: remark.remark,
        academicId: remark.academicId,
      }).onDuplicateKeyUpdate({
        set: { remark: remark.remark, updatedAt: new Date() }
      });
    }, "upsertTeacherRemark");
  }

  async upsertExamSetup(setup: any, tx?: MySQLDrizzleClient): Promise<number> {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const [existing] = await db
        .select({ id: examSetups.id })
        .from(examSetups)
        .where(
          and(
            eq(examSetups.examId, setup.examId),
            eq(examSetups.subjectId, setup.subjectId),
            eq(examSetups.classId, setup.classId),
            eq(examSetups.sectionId, setup.sectionId)
          )
        )
        .limit(1);

      if (existing) {
        await db.update(examSetups).set({ examMark: setup.examMark }).where(eq(examSetups.id, existing.id));
        return existing.id;
      }
      
      const [res] = await db.insert(examSetups).values({
        tenantId: setup.schoolId || 1,
        examId: setup.examId,
        classId: setup.classId,
        sectionId: setup.sectionId,
        subjectId: setup.subjectId,
        enrollmentId: setup.studentRecordId || null,
        title: setup.examTitle,
        examMark: setup.examMark,
      }).$returningId();
      return res?.id;
    }, "upsertExamSetup");
  }

  async getMarkGrade(p: any): Promise<{ gradeName: string; point: number }[]> {
    return this.withErrorHandling(async () => {
      const results = await this.db
        .select({ gradeName: grades.name, point: grades.point })
        .from(grades)
        .where(
          and(
            sql`${p.percentage} BETWEEN ${grades.fromMark} AND ${grades.toMark}`,
            eq(grades.tenantId, p.schoolId)
          )
        );
      return results as any[];
    }, "getMarkGrade");
  }

  async batchUpsertMarkRecords(data: any[], tx?: MySQLDrizzleClient) {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      for (const row of data) {
        await db.insert(examMarks).values({
          tenantId: row.tenantId || row.schoolId || 1,
          examSetupId: row.examSetupId,
          userId: row.studentId,
          enrollmentId: row.studentRecordId,
          totalMarks: row.totalMarks,
          isAbsent: row.isAbsent || 0,
        }).onDuplicateKeyUpdate({
          set: {
            totalMarks: row.totalMarks,
            isAbsent: row.isAbsent || 0,
            updatedAt: new Date(),
          }
        });
      }
    }, "batchUpsertMarkRecords");
  }

  async batchUpsertResultRecords(data: any[], tx?: MySQLDrizzleClient) {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      for (const row of data) {
        await db.insert(computedResults).values({
          tenantId: row.tenantId || row.schoolId || 1,
          userId: row.studentId,
          examId: row.examId,
          classId: row.classId,
          sectionId: row.sectionId,
          enrollmentId: row.studentRecordId,
          totalMarks: row.totalMarks,
          teacherRemarks: row.teacherRemarks,
          academicId: row.academicId,
        }).onDuplicateKeyUpdate({
          set: {
            totalMarks: row.totalMarks,
            teacherRemarks: row.teacherRemarks,
            updatedAt: new Date(),
          }
        });
      }
    }, "batchUpsertResultRecords");
  }
}
