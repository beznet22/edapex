// /src/lib/server/repository/student.repo.ts

import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
  smAssignSubjects,
  smBaseSetups,
  smClasses,
  smParents,
  smSections,
  smStaffs,
  smStudentCategories,
  smStudents,
  studentRecords,
} from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";

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

export type StudentRecord = typeof studentRecords.$inferSelect;

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

  async getStudentsByUserId(userId: number): Promise<ClassStudent[] | null> {
    const [staff] = await this.db.select().from(smStaffs).where(eq(smStaffs.userId, userId)).limit(1);
    if (!staff) return null;

    const [classSection] = await this.db
      .select()
      .from(smAssignSubjects)
      .where(eq(smAssignSubjects.teacherId, staff.id))
      .limit(1);
    if (!classSection) return null;

    const students = await this.db
      .select({
        id: smStudents.id,
        name: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
      })
      .from(smStudents)
      .leftJoin(
        studentRecords,
        and(eq(smStudents.id, studentRecords.studentId), eq(studentRecords.activeStatus, 1))
      )
      .where(
        and(
          eq(studentRecords.classId, classSection.classId || 0),
          eq(studentRecords.sectionId, classSection.sectionId || 0),
          eq(smStudents.activeStatus, 1)
        )
      );

    return students;
  }

  async getStudentRecordByAdmissionNo(admissionNo: number): Promise<StudentRecord | null> {
    const academicId = await this.getAcademicId();
    const [record] = await this.db
      .select()
      .from(studentRecords)
      .innerJoin(smStudents, eq(studentRecords.studentId, smStudents.id))
      .where(
        and(
          eq(smStudents.admissionNo, admissionNo),
          eq(studentRecords.academicId, academicId),
          eq(smStudents.activeStatus, 1),
          eq(studentRecords.isDefault, 1)
        )
      )
      .limit(1);
    return record?.student_records || null;
  }

  async getStudentById(id: number, isAdminNo = false): Promise<StudentDetails | null> {
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
