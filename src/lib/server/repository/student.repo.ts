// /src/lib/server/repository/student.repo.ts

import { and, count, eq, isNotNull, ne, sql, like, or } from "drizzle-orm";
import {
  classAttendances,
  smAssignSubjects,
  smBaseGroups,
  smBaseSetups,
  smClasses,
  smMarkStores,
  smParents,
  smSections,
  smClassSections,
  smStaffs,
  smStudentCategories,
  smStudents,
  studentRecords,
  users,
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

/** Guardian relation type */
export type GuardianRelation = "father" | "mother" | "other";

/** Minimal required input for creating a new student */
export type CreateStudentInput = {
  // Student info
  admissionNo?: number; // optional - only checks for existing student if provided
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  dateOfBirth?: string;
  // Required references
  classId: number;
  sectionId: number;
  genderId: number;
  studentCategoryId: number;
  roleId?: number; // defaults to student role (2)
  schoolId?: number; // defaults to 1
  academicId?: number; // fetched from session if not provided
  // Parent/guardian info (required)
  guardianRelation: GuardianRelation; // father, mother, or other
  guardiansName: string;
  guardiansMobile: string;
  guardiansEmail: string;
};

export class StudentRepository extends BaseRepository {
  /**
   * Creates a new student with all required related records (user, parent, student, student record)
   * if a student with the given admission number does not already exist.
   * @param input - Minimal required data for creating a student
   * @returns The existing or newly created student record
   */
  async creatStudentIfNotExists(input: CreateStudentInput) {
    const {
      admissionNo,
      firstName,
      lastName,
      email,
      mobile,
      dateOfBirth,
      classId,
      sectionId,
      genderId,
      studentCategoryId,
      roleId = 2, // default student role
      schoolId = 1,
      guardianRelation,
      guardiansName,
      guardiansMobile,
      guardiansEmail,
    } = input;

    // Construct full name from first and last name
    const fullName = `${firstName} ${lastName}`.trim();

    // Step 1: Check if student already exists by admission number (only if provided)
    if (admissionNo) {
      const [existingStudent] = await this.db
        .select()
        .from(smStudents)
        .where(eq(smStudents.admissionNo, admissionNo))
        .limit(1);
      if (existingStudent) return existingStudent;
    }

    // Get academic year ID
    const academicId = input.academicId ?? (await this.getAcademicId());

    // Step 2: Create a User for the student
    const [user] = await this.db
      .insert(users)
      .values({
        fullName,
        email,
        phoneNumber: mobile,
        usertype: "student",
        roleId,
        schoolId,
        walletBalance: 0,
        activeStatus: 1,
      })
      .$returningId();

    // Step 3: Create a User for the parent/guardian
    const [parentUser] = await this.db
      .insert(users)
      .values({
        fullName: guardiansName,
        email: guardiansEmail,
        phoneNumber: guardiansMobile,
        usertype: "parent",
        roleId: 3, // parent role
        schoolId,
        walletBalance: 0,
        activeStatus: 1,
      })
      .$returningId();

    // Step 4: Create a Parent record with father/mother/guardian info based on relation
    const parentData: Record<string, unknown> = {
      guardiansName,
      guardiansMobile,
      guardiansEmail,
      guardiansRelation: guardianRelation,
      userId: parentUser.id,
      schoolId,
      academicId,
      activeStatus: 1,
    };

    // Set father or mother fields based on guardian relation
    if (guardianRelation === "father") {
      parentData.fathersName = guardiansName;
      parentData.fathersMobile = guardiansMobile;
    } else if (guardianRelation === "mother") {
      parentData.mothersName = guardiansName;
      parentData.mothersMobile = guardiansMobile;
    }

    const [parent] = await this.db.insert(smParents).values(parentData).$returningId();

    // Step 5: Create the Student record
    const [newStudent] = await this.db
      .insert(smStudents)
      .values({
        admissionNo,
        fullName,
        firstName,
        lastName,
        email,
        mobile,
        dateOfBirth,
        parentId: parent.id,
        userId: user.id,
        roleId,
        genderId,
        studentCategoryId,
        classId,
        sectionId,
        sessionId: academicId,
        academicId,
        schoolId,
        activeStatus: 1,
      })
      .$returningId();

    // Step 6: Create the Student Record (class enrollment)
    await this.db.insert(studentRecords).values({
      studentId: newStudent.id,
      classId,
      sectionId,
      sessionId: academicId,
      academicId,
      schoolId,
      isDefault: 1,
      isPromote: 0,
      activeStatus: 1,
    });

    // Return the full student record
    const [createdStudent] = await this.db
      .select()
      .from(smStudents)
      .where(eq(smStudents.id, newStudent.id))
      .limit(1);

    return createdStudent;
  }

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

  async getStudentsByClassId(params: { classId: number; sectionId: number }) {
    const { classId, sectionId } = params;
    const academicId = await this.getAcademicId();
    const students = await this.db
      .select({
        id: smStudents.id,
        name: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
      })
      .from(smStudents)
      .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
      .where(
        and(
          eq(studentRecords.classId, classId),
          eq(studentRecords.sectionId, sectionId),
          eq(studentRecords.academicId, academicId),
          eq(smStudents.activeStatus, 1),
          eq(studentRecords.activeStatus, 1),
          eq(studentRecords.isDefault, 1)
        )
      );

    return students;
  }

  async getStudentsByClassSection(params: { classId: number; sectionId: number }) {
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
      .where(
        and(
          eq(studentRecords.classId, classId),
          eq(studentRecords.sectionId, sectionId),
          eq(studentRecords.academicId, academicId),
          eq(smStudents.activeStatus, 1)
        )
      );
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
      .where(
        and(
          eq(studentRecords.classId, classSection.classId || 0),
          eq(studentRecords.sectionId, classSection.sectionId || 0),
          eq(studentRecords.academicId, academicId),
          eq(smStudents.activeStatus, 1)
        )
      )
      .groupBy(smStudents.id);
    return students;
  }

  async createIfNotExistsStudentRecord(params: {
    studentId?: number | null;
    classId?: number | null;
    sectionId?: number | null;
  }) {
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

  async getStudentRecord(params: { classId: number; sectionId: number; studentId: number }) {
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
      .leftJoin(
        studentRecords,
        and(
          eq(smStudents.id, studentRecords.studentId),
          eq(studentRecords.academicId, academicId),
          eq(studentRecords.isDefault, 1),
          eq(studentRecords.activeStatus, 1)
        )
      )
      .where(and(eq(smStudents.admissionNo, admissionNo), eq(smStudents.activeStatus, 1)))
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

  async updateStudentPhoto(studentId: number, photoPath: string) {
    const [updated] = await this.db
      .update(smStudents)
      .set({ studentPhoto: photoPath })
      .where(eq(smStudents.id, studentId));
    return updated.affectedRows > 0;
  }

  async updateStudentCategoryId(studentId: number, studentCategoryId: number) {
    const [updated] = await this.db
      .update(smStudents)
      .set({ studentCategoryId })
      .where(eq(smStudents.id, studentId));
    return updated.affectedRows > 0;
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

  /**
   * Get all options needed for student registration form
   * @returns Object with classes, sections, categories, genders, and guardian relations
   */
  async getStudentRegistrationOptions() {
    const academicId = await this.getAcademicId();

    // Fetch all data in parallel
    const [classes, sections, categories, genders] = await Promise.all([
      // Classes
      this.db
        .select({ id: smClasses.id, name: smClasses.className })
        .from(smClasses)
        .where(and(eq(smClasses.activeStatus, 1), eq(smClasses.academicId, academicId))),

      // Sections
      this.db
        .select({ id: smSections.id, name: smSections.sectionName })
        .from(smSections)
        .where(and(eq(smSections.activeStatus, 1), eq(smSections.academicId, academicId))),

      // Student categories (not filtered by academicId as categories are typically global)
      this.db
        .select({ id: smStudentCategories.id, name: smStudentCategories.categoryName })
        .from(smStudentCategories),

      // Genders (baseGroupId 1 is typically for genders, fetching by joining with base groups)
      this.db
        .select({
          id: smBaseSetups.id,
          name: smBaseSetups.baseSetupName,
          groupName: smBaseGroups.name,
        })
        .from(smBaseSetups)
        .innerJoin(smBaseGroups, eq(smBaseSetups.baseGroupId, smBaseGroups.id))
        .where(and(eq(smBaseSetups.activeStatus, 1), eq(smBaseGroups.name, "Gender"))),
    ]);

    return {
      classes,
      sections,
      categories,
      genders: genders.map((g) => ({ id: g.id, name: g.name })),
      guardianRelations: [
        { value: "father", label: "Father" },
        { value: "mother", label: "Mother" },
        { value: "other", label: "Other" },
      ],
    };
  }

  /**
   * Resolves class and section names to their corresponding IDs.
   * @param className - The name of the class
   * @param sectionName - The name of the section
   * @returns The resolved IDs or null if not found
   */
  async getClassAndSectionByName(className: string, sectionName: string) {
    const academicId = await this.getAcademicId();

    const [data] = await this.db
      .select({
        classId: smClasses.id,
        sectionId: smSections.id,
      })
      .from(smClassSections)
      .innerJoin(smClasses, eq(smClassSections.classId, smClasses.id))
      .innerJoin(smSections, eq(smClassSections.sectionId, smSections.id))
      .where(
        and(
          eq(smClasses.className, className.toUpperCase()),
          eq(smSections.sectionName, sectionName.toUpperCase()),
          eq(smClasses.activeStatus, 1),
          eq(smSections.activeStatus, 1),
          eq(smClassSections.activeStatus, 1),
          eq(smClasses.academicId, academicId)
        )
      )
      .limit(1);

    return data || null;
  }

  /**
   * Searches for available class and section combinations.
   * @param query - Optional search string to filter by class or section name
   * @returns Array of matching class/section combinations with their IDs
   */
  async searchClassSection(query?: string) {
    const academicId = await this.getAcademicId();

    const filters = [
      eq(smClasses.activeStatus, 1),
      eq(smSections.activeStatus, 1),
      eq(smClassSections.activeStatus, 1),
      eq(smClasses.academicId, academicId),
    ];

    if (query) {
      const searchPattern = `%${query.toUpperCase()}%`;
      filters.push(
        or(
          like(smClasses.className, searchPattern),
          like(smSections.sectionName, searchPattern),
          like(sql`CONCAT(${smClasses.className}, ' ', ${smSections.sectionName})`, searchPattern),
          like(sql`CONCAT(${smClasses.className}, ${smSections.sectionName})`, searchPattern)
        ) as any
      );
    }

    return await this.db
      .select({
        classId: smClasses.id,
        className: smClasses.className,
        sectionId: smSections.id,
        sectionName: smSections.sectionName,
      })
      .from(smClassSections)
      .innerJoin(smClasses, eq(smClassSections.classId, smClasses.id))
      .innerJoin(smSections, eq(smClassSections.sectionId, smSections.id))
      .where(and(...filters))
      .limit(20);
  }

  /**
   * Assigns a student to a new class/section.
   * - Performs a direct upsert (create or update) on the student_records table.
   */
  async assignClassSection(params: {
    studentId: number;
    classId: number;
    sectionId: number;
  }) {
    return this.withErrorHandling(async () => {
      const { studentId, classId, sectionId } = params;
      const academicId = await this.getAcademicId();

      // Upsert destination record
      const [existingDest] = await this.db
        .select({ id: studentRecords.id })
        .from(studentRecords)
        .where(
          and(
            eq(studentRecords.studentId, studentId),
            eq(studentRecords.academicId, academicId)
          )
        )
        .limit(1);

      if (existingDest) {
        await this.db
          .update(studentRecords)
          .set({ activeStatus: 1, isDefault: 1, classId, sectionId })
          .where(eq(studentRecords.id, existingDest.id));
      } else {
        await this.db.insert(studentRecords).values({
          studentId,
          classId,
          sectionId,
          academicId,
          sessionId: academicId,
          schoolId: 1,
          isDefault: 1,
          activeStatus: 1,
        });
      }

      return true;
    }, "assignClassSection");
  }
}

// ✅ Singleton export — the only one you need
export const studentRepo = await StudentRepository.build();
