// /src/lib/server/repository/student.repo.ts

import { and, count, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
  classAttendances,
  smAssignSubjects,
  smBaseSetups,
  smClasses,
  smMarkStores,
  smParents,
  smSections,
  smStaffs,
  smStudentCategories,
  smStudents,
  studentRecords,
} from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";
import type { Attendance } from "$lib/schema/result-input";
import type { NewAttendance, StudentRecord } from "$lib/types/result-types";

export type StudentDetails = {
  studentId: number;
  admissionNo: number | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  studentPhoto: string | null;
  dateOfBirth: string | null; // Adjust based on actual type
  genderName: string | null;
  categoryName: string | null;
  parentId: number | null;
  guardiansName: string | null;
  guardiansMobile: string | null;
  guardiansEmail: string | null;
  classId: number | null;
  sectionId: number | null;
  className: string | null;
  sectionName: string | null;
  studentRecordId: number | null;
  schoolId: number | null;
};

export type ClassStudent = {
  id: number;
  name: string | null;
  admissionNo: number | null;
};

export class StudentRepository extends BaseRepository {
  async getStudentBySiblings() {
    const student = await this.db
      .select({
        studentId: smStudents.id,
        admissionNo: smStudents.admissionNo,
        fullName: smStudents.fullName,
        parentId: smStudents.parentId,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
      })
      .from(smParents)
      .leftJoin(smStudents, and(eq(smParents.id, smStudents.parentId), eq(smParents.activeStatus, 1)))
      .where(and(eq(smStudents.activeStatus, 1)))
      .groupBy(smParents.id);

    return student || null;
  }



  async getStudentsByClassId(classId: number, sectionId?: number) {
    const academicId = await this.getAcademicId();

    // Build conditions array
    const conditions = [
      eq(studentRecords.classId, classId),
      eq(studentRecords.academicId, academicId),
      eq(smStudents.activeStatus, 1),
      eq(studentRecords.activeStatus, 1),
      eq(studentRecords.isDefault, 1)
    ];

    if (sectionId) {
      conditions.push(eq(studentRecords.sectionId, sectionId));
    }

    const students = await this.db
      .select({
        id: smStudents.id,
        name: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
      })
      .from(smStudents)
      .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
      .where(and(...conditions));

    return students;
  }

  async getStudentsByClassSection(params: { classId: number, sectionId: number }) {
    const { classId, sectionId } = params;
    if (!classId || !sectionId) return null;
    const academicId = await this.getAcademicId();
    const students = await this.db
      .select({
        id: smStudents.id,
        name: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
      })
      .from(smStudents)
      .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
      .where(and(
        eq(studentRecords.classId, classId),
        eq(studentRecords.sectionId, sectionId),
        eq(studentRecords.academicId, academicId),
        eq(smStudents.activeStatus, 1)));
    return students;
  }

  async getStudentsByStaffId(staffId?: number) {
    if (!staffId) return null;
    const academicId = await this.getAcademicId();
    const [classSection] = await this.db
      .select()
      .from(smAssignSubjects)
      .where(
        and(
          eq(smAssignSubjects.teacherId, staffId),
          eq(smAssignSubjects.academicId, academicId),
          eq(smAssignSubjects.activeStatus, 1)
        )
      )
      .limit(1);
    if (!classSection) return null;

    const students = await this.db
      .select({
        id: smStudents.id,
        name: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
        // categoryId: smStudents.studentCategoryId,
      })
      .from(smStudents)
      // .innerJoin(
      //   smMarkStores,
      //   and(
      //     eq(smMarkStores.studentId, smStudents.id),
      //     eq(smMarkStores.examTermId, examType.id),
      //     eq(smMarkStores.activeStatus, 1),
      //     eq(smMarkStores.academicId, academicId),
      //     eq(smMarkStores.classId, classSection.classId || 0),
      //     eq(smMarkStores.sectionId, classSection.sectionId || 0),
      //     eq(smMarkStores.activeStatus, smStudents.activeStatus)
      //   )
      // )
      .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
      .where(and(
        eq(studentRecords.classId, classSection.classId || 0),
        eq(studentRecords.sectionId, classSection.sectionId || 0),
        eq(studentRecords.academicId, academicId),
        eq(smStudents.activeStatus, 1)))
      .groupBy(smStudents.id);
    return students;
  }

  async createIfNotExistsStudentRecord(params: { studentId?: number | null, classId?: number | null, sectionId?: number | null }) {
    const { studentId, classId, sectionId } = params;
    if (!studentId || !classId || !sectionId) return null;
    const academicId = await this.getAcademicId();
    const [record] = await this.db
      .select()
      .from(studentRecords)
      .where(
        and(
          eq(studentRecords.studentId, studentId),
          eq(studentRecords.classId, classId),
          eq(studentRecords.sectionId, sectionId),
          eq(studentRecords.isDefault, 1),
          eq(studentRecords.academicId, academicId),
          eq(studentRecords.activeStatus, 1)
        )
      )
      .limit(1);
    if (record) return record.id;
    const [inserted] = await this.db.insert(studentRecords).values({
      studentId,
      classId,
      sectionId,
      isDefault: 1,
      academicId,
      sessionId: academicId,
      schoolId: 1,
      activeStatus: 1,
    });
    if (inserted.affectedRows === 0) return null;
    return inserted.insertId;
  }

  async getStudentRecord(params: { classId: number, sectionId: number, studentId: number }) {
    const { classId, sectionId, studentId } = params;
    if (!classId || !sectionId || !studentId) return null;
    const academicId = await this.getAcademicId();
    const [record] = await this.db
      .select({
        id: studentRecords.id,
        categoryId: smStudents.studentCategoryId,
      })
      .from(studentRecords)
      .leftJoin(smStudents, eq(studentRecords.studentId, smStudents.id))
      .where(
        and(
          eq(studentRecords.studentId, studentId),
          eq(studentRecords.classId, classId),
          eq(studentRecords.sectionId, sectionId),
          eq(studentRecords.isDefault, 1),
          eq(studentRecords.academicId, academicId),
          eq(studentRecords.activeStatus, 1)
        )
      )
      .limit(1);
    return record || null;
  }

  async getStudentRecordByAdmissionNo(admissionNo: number): Promise<StudentRecord | null> {
    const academicId = await this.getAcademicId();
    const [record] = await this.db
      .select({
        id: smStudents.id,
        recordId: studentRecords.id,
        classId: studentRecords.classId,
        sectionId: studentRecords.sectionId,
        studentId: studentRecords.studentId,
        isDefault: studentRecords.isDefault,
        fullName: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
        parentId: smStudents.parentId,
        schoolId: smStudents.schoolId,
      })
      .from(smStudents)
      .leftJoin(studentRecords, and(eq(smStudents.id, studentRecords.studentId),
        eq(studentRecords.academicId, academicId),
        eq(studentRecords.isDefault, 1),
        eq(studentRecords.activeStatus, 1)))
      .where(
        and(
          eq(smStudents.admissionNo, admissionNo),
          eq(smStudents.activeStatus, 1),
        )
      )
      .limit(1);
    return record || null;
  }

  async updateStudent(student: StudentDetails) {
    const [updated] = await this.db
      .update(smStudents)
      .set({ fullName: student.fullName })
      .where(eq(smStudents.id, student.studentId));
    if (updated.affectedRows === 0) return null;
    return updated;
  }

  async getStudentById(id?: number, isAdminNo = false): Promise<StudentDetails | null> {
    if (!id) return null;
    const academicId = await this.getAcademicId();
    const field = isAdminNo ? smStudents.admissionNo : smStudents.id;

    const [student] = await this.db
      .select({
        studentId: smStudents.id,
        admissionNo: smStudents.admissionNo,
        fullName: smStudents.fullName,
        firstName: smStudents.firstName,
        lastName: smStudents.lastName,
        email: smParents.guardiansEmail,
        mobile: smParents.guardiansMobile,
        studentPhoto: smStudents.studentPhoto,
        dateOfBirth: smStudents.dateOfBirth,
        genderName: smBaseSetups.baseSetupName,
        categoryName: smStudentCategories.categoryName,
        parentId: smStudents.parentId,
        guardiansName: smParents.guardiansName,
        guardiansMobile: smParents.guardiansMobile,
        guardiansEmail: smParents.guardiansEmail,
        classId: studentRecords.classId,
        sectionId: studentRecords.sectionId,
        className: smClasses.className,
        sectionName: smSections.sectionName,
        studentRecordId: studentRecords.id,
        schoolId: studentRecords.schoolId,
      })
      .from(smStudents)
      .leftJoin(smBaseSetups, eq(smStudents.genderId, smBaseSetups.id))
      .leftJoin(smParents, eq(smStudents.parentId, smParents.id))
      .leftJoin(smStudentCategories, eq(smStudents.studentCategoryId, smStudentCategories.id))
      .leftJoin(
        studentRecords,
        and(
          eq(smStudents.id, studentRecords.studentId),
          eq(studentRecords.academicId, academicId),
          eq(studentRecords.activeStatus, 1),
          eq(studentRecords.isDefault, 1)
        )
      )
      .leftJoin(smClasses, eq(studentRecords.classId, smClasses.id))
      .leftJoin(smSections, eq(studentRecords.sectionId, smSections.id))
      .where(and(eq(field, id), eq(smStudents.activeStatus, 1)))
      .limit(1);

    return student || null;
  }

  getStuendtsByParentId(parentId: number) {
    return this.db
      .select()
      .from(smStudents)
      .where(and(eq(smStudents.parentId, parentId), eq(smStudents.activeStatus, 1)));
  }
}

// ✅ Singleton export — the only one you need
export const studentRepo = await StudentRepository.build();
