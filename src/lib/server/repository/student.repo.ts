// /src/lib/server/repository/student.repo.ts

import { and, count, eq, isNotNull, ne, sql, like, or, desc, asc, inArray, type InferInsertModel } from "drizzle-orm";
import { type MySQLDrizzleClient } from "./base.repo";
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
  smStudentPromotions,
  smFeesMasters,
  smFeesAssigns,
  chatGroups,
  chatGroupUsers,
  smAcademicYears,
} from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";
import type { Attendance } from "$lib/schema/result-input";
import type { NewAttendance, StudentRecord } from "$lib/types/result-types";
import { hashPwd } from "$lib/server/helpers/utils";

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
  genderId: number | null;
  categoryName: string | null;
  studentCategoryId: number | null;
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
  academicId: number | null;
  rollNo: number | null;
  userId: number | null;
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
  // Parent/guardian info
  guardianRelation: GuardianRelation; // father, mother, or other
  guardiansName: string;
  guardiansMobile: string;
  guardiansEmail: string;
  // Optional sibling linkage
  siblingAdmissionNo?: number;
};

export class StudentRepository extends BaseRepository {
  /**
   * Creates a new student with all required related records (user, parent, student, student record)
   * if a student with the given admission number does not already exist.
   * @param input - Minimal required data for creating a student
   * @returns The existing or newly created student record
   */
  async createStudentIfNotExists(input: CreateStudentInput): Promise<typeof smStudents.$inferSelect & { studentPassword: string; parentPassword: string | undefined }> {
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
      siblingAdmissionNo,
    } = input;

    // Construct full name from first and last name
    const fullName = `${firstName} ${lastName}`.trim();
    const finalAdmissionNo = admissionNo ?? (await this.getLastAdmissionNo()) + 1;
    const academicId = input.academicId ?? (await this.getAcademicId());

    // Step 1: Check for existing student email conflicts
    if (email) {
      const [existingStudentUser] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingStudentUser) {
        throw new Error("USER_EXISTS");
      }
    }

    let parentId: number | null = null;
    let parentPassword: string | undefined = undefined;
    let parentUserId: number | null = null;

    // Step 2: Try to find existing parent via sibling or email
    let existingParentRecord: typeof smParents.$inferSelect | null = null;

    if (siblingAdmissionNo) {
      const results = await this.db
        .select({
          parent: smParents,
        })
        .from(smStudents)
        .innerJoin(smParents, eq(smStudents.parentId, smParents.id))
        .where(eq(smStudents.admissionNo, siblingAdmissionNo))
        .limit(1);
      if (results.length > 0) {
        existingParentRecord = results[0].parent;
      }
    }

    if (!existingParentRecord && guardiansEmail) {
      const [parent] = await this.db
        .select()
        .from(smParents)
        .where(eq(smParents.guardiansEmail, guardiansEmail))
        .limit(1);
      if (parent) {
        existingParentRecord = parent;
      }
    }

    if (existingParentRecord) {
      parentId = existingParentRecord.id;
      parentUserId = existingParentRecord.userId;

      // Verify if the linked user account actually exists
      let userExists = false;
      if (parentUserId) {
        const [u] = await this.db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, parentUserId))
          .limit(1);
        userExists = !!u;
      }

      // If no userId or user record is gone, RECOVER/CREATE it
      if (!userExists) {
        parentPassword = Math.random().toString(36).slice(-8);
        const [recoveredUser] = await this.db
          .insert(users)
          .values({
            fullName: existingParentRecord.guardiansName || guardiansName,
            email: existingParentRecord.guardiansEmail || guardiansEmail,
            phoneNumber: existingParentRecord.guardiansMobile || guardiansMobile,
            password: hashPwd(parentPassword),
            usertype: "parent",
            roleId: 3,
            schoolId,
            walletBalance: 0,
            activeStatus: 1,
          })
          .$returningId();

        parentUserId = recoveredUser.id;
        // Update the existing parent record with the new userId
        await this.db.update(smParents).set({ userId: parentUserId }).where(eq(smParents.id, parentId!));
      }
    } else if (guardiansEmail) {
      // No smParents record, check if a USER with this email already exists (orphaned user)
      const [orphanedUser] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, guardiansEmail), eq(users.roleId, 3)))
        .limit(1);

      if (orphanedUser) {
        parentUserId = orphanedUser.id;
      }
    }

    // Step 3: Create parent record if not found (or link it to orphaned user)
    if (!parentId) {
      if (!parentUserId) {
        parentPassword = Math.random().toString(36).slice(-8);
        const [newUser] = await this.db
          .insert(users)
          .values({
            fullName: guardiansName,
            email: guardiansEmail,
            phoneNumber: guardiansMobile,
            password: hashPwd(parentPassword),
            usertype: "parent",
            roleId: 3,
            schoolId,
            walletBalance: 0,
            activeStatus: 1,
          })
          .$returningId();
        parentUserId = newUser.id;
      }

      const parentData: Record<string, any> = {
        guardiansName,
        guardiansMobile,
        guardiansEmail,
        guardiansRelation: guardianRelation,
        userId: parentUserId,
        schoolId,
        academicId,
        activeStatus: 1,
      };

      if (guardianRelation === "father") {
        parentData.fathersName = guardiansName;
        parentData.fathersMobile = guardiansMobile;
      } else if (guardianRelation === "mother") {
        parentData.mothersName = guardiansName;
        parentData.mothersMobile = guardiansMobile;
      }

      const [newParent] = await this.db.insert(smParents).values(parentData).$returningId();
      parentId = newParent.id;
    }

    // Generate temporary student password
    const studentPassword = Math.random().toString(36).slice(-8);

    // Step 4: Create a User for the student
    const [user] = await this.db
      .insert(users)
      .values({
        fullName,
        email,
        phoneNumber: mobile,
        password: hashPwd(studentPassword),
        usertype: "student",
        roleId,
        schoolId,
        walletBalance: 0,
        activeStatus: 1,
      })
      .$returningId();

    // Step 5: Create the Student record
    const [newStudent] = await this.db
      .insert(smStudents)
      .values({
        admissionNo: finalAdmissionNo,
        fullName,
        firstName,
        lastName,
        email,
        mobile,
        dateOfBirth,
        parentId: parentId,
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

    return {
      ...createdStudent,
      studentPassword,
      parentPassword,
    };
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

  async getStudentsByClassSection(params: { classId: number; sectionId: number }, query?: string) {
    const { classId, sectionId } = params;
    if (!classId || !sectionId) return null;
    const academicId = await this.getAcademicId();

    const conditions = [
      eq(studentRecords.classId, classId),
      eq(studentRecords.sectionId, sectionId),
      eq(studentRecords.academicId, academicId),
      eq(studentRecords.activeStatus, 1),
      eq(smStudents.activeStatus, 1),
      eq(studentRecords.isDefault, 1),
    ];

    if (query) {
      conditions.push(
        or(
          like(smStudents.fullName, `%${query}%`),
          like(smStudents.admissionNo, `%${query}%`)
        ) as any
      );
    }

    const students = await this.db
      .select({
        id: smStudents.id,
        name: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
      })
      .from(smStudents)
      .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
      .where(and(...conditions))
      .orderBy(asc(smStudents.id));
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
          eq(smAssignSubjects.activeStatus, 1),
        ),
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
          eq(smStudents.activeStatus, 1),
        ),
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
          eq(studentRecords.activeStatus, 1),
        ),
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

  async getStudentRecord(params: { classId: number; sectionId: number; studentId: number }): Promise<{
    id: number;
    categoryId: number | null;
    fullName: string | null;
    admissionNo: number | null;
  } | null> {
    const { classId, sectionId, studentId } = params;
    if (!classId || !sectionId || !studentId) return null;
    const academicId = await this.getAcademicId();
    const [record] = await this.db
      .select({
        id: studentRecords.id,
        categoryId: smStudents.studentCategoryId,
        fullName: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
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
          eq(studentRecords.activeStatus, 1),
        ),
      )
      .limit(1);
    return record || null;
  }

  async getStudentRecordByAdmissionNo(admissionNo: number): Promise<StudentRecord | null> {
    const academicId = await this.getAcademicId();
    const [record] = await this.db
      .select({
        id: smStudents.id,
        userId: smStudents.userId,
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
          eq(studentRecords.activeStatus, 1),
        ),
      )
      .where(and(eq(smStudents.admissionNo, admissionNo), eq(smStudents.activeStatus, 1)))
      .limit(1);
    return record || null;
  }

  async updateStudent(student: Partial<StudentDetails> & { studentId: number }) {
    const updateData: Record<string, any> = {};
    if (student.fullName !== undefined) updateData.fullName = student.fullName;
    if (student.firstName !== undefined) updateData.firstName = student.firstName;
    if (student.lastName !== undefined) updateData.lastName = student.lastName;
    if (student.dateOfBirth !== undefined) updateData.dateOfBirth = student.dateOfBirth;
    if (student.genderId !== undefined) updateData.genderId = student.genderId;
    if (student.studentCategoryId !== undefined) updateData.studentCategoryId = student.studentCategoryId;
    if (student.classId !== undefined) updateData.classId = student.classId;
    if (student.sectionId !== undefined) updateData.sectionId = student.sectionId;
    if (student.rollNo !== undefined) updateData.rollNo = student.rollNo;

    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await this.db
      .update(smStudents)
      .set(updateData)
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

  async updateStudentCategoryId(studentId: number, studentCategoryId: number, tx?: MySQLDrizzleClient) {
    const db = tx || this.db;
    const [updated] = await db
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
        academicId: studentRecords.academicId,
        genderId: smStudents.genderId,
        studentCategoryId: smStudents.studentCategoryId,
        rollNo: smStudents.rollNo,
        userId: smStudents.userId,
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
          eq(studentRecords.isDefault, 1),
        ),
      )
      .leftJoin(smClasses, eq(studentRecords.classId, smClasses.id))
      .leftJoin(smSections, eq(studentRecords.sectionId, smSections.id))
      .where(and(eq(field, id), eq(smStudents.activeStatus, 1)))
      .limit(1);

    return student || null;
  }

  /** Alias for test compatibility and Mastra tool contracts */
  async getById(id?: number, isAdminNo = false): Promise<StudentDetails | null> {
    return this.getStudentById(id, isAdminNo);
  }

  /**
   * Returns a full raw student row by id (not the detailed join StudentDetails).
   * Used by demoteStudentTool to get current class/section/session.
   */
  async getRawStudentById(studentId: number): Promise<typeof smStudents.$inferSelect | null> {
    if (!studentId) return null;
    const [student] = await this.db
      .select()
      .from(smStudents)
      .where(eq(smStudents.id, studentId))
      .limit(1);
    return student ?? null;
  }

  /**
   * Get the latest promotion record for a student.
   */
  async getLatestPromotion(studentId: number): Promise<typeof smStudentPromotions.$inferSelect | null> {
    const [record] = await this.db
      .select()
      .from(smStudentPromotions)
      .where(eq(smStudentPromotions.studentId, studentId))
      .orderBy(desc(smStudentPromotions.id))
      .limit(1);
    return record ?? null;
  }

  /**
   * Revert a student promotion: deactivates the current default record,
   * reactivates the previous record, and updates smStudents back.
   * Returns the promotion details needed for audit logging.
   */
  async demoteStudent(params: {
    studentId: number;
    promotionId: number;
    currentClassId: number;
    currentSectionId: number;
    currentSessionId: number;
    previousClassId: number;
    previousSectionId: number;
    previousSessionId: number;
    previousRollNumber: number | null;
  }) {
    return this.withErrorHandling(async () => {
      const { studentId, promotionId, currentClassId, currentSectionId, currentSessionId, previousClassId, previousSectionId, previousSessionId, previousRollNumber } = params;

      await this.db.transaction(async (tx) => {
        const [currentRecord] = await tx
          .select({ id: studentRecords.id })
          .from(studentRecords)
          .where(
            and(
              eq(studentRecords.studentId, studentId),
              eq(studentRecords.classId, currentClassId),
              eq(studentRecords.sectionId, currentSectionId),
              eq(studentRecords.academicId, currentSessionId),
              eq(studentRecords.isDefault, 1),
            ),
          )
          .limit(1);

        const [previousRecord] = await tx
          .select({ id: studentRecords.id })
          .from(studentRecords)
          .where(
            and(
              eq(studentRecords.studentId, studentId),
              eq(studentRecords.classId, previousClassId),
              eq(studentRecords.sectionId, previousSectionId),
              eq(studentRecords.academicId, previousSessionId),
            ),
          )
          .limit(1);

        if (currentRecord) {
          await tx
            .update(studentRecords)
            .set({ isDefault: 0, activeStatus: 0 })
            .where(eq(studentRecords.id, currentRecord.id));
        }

        if (previousRecord) {
          await tx
            .update(studentRecords)
            .set({ isDefault: 1, isPromote: 0, activeStatus: 1 })
            .where(eq(studentRecords.id, previousRecord.id));
        }

        await tx
          .update(smStudents)
          .set({
            classId: previousClassId,
            sectionId: previousSectionId,
            sessionId: previousSessionId,
            academicId: previousSessionId,
            rollNo: previousRollNumber,
          })
          .where(eq(smStudents.id, studentId));

        await tx
          .delete(smStudentPromotions)
          .where(eq(smStudentPromotions.id, promotionId));
      });

      return { success: true, studentId, previousClassId, previousSectionId, previousSessionId };
    }, "demoteStudent");
  }

  /** Slice 1: Resolve a genderId from a human-readable gender name. Returns null if not found. */
  async resolveGenderId(name: string): Promise<number | null> {
    if (!name) return null;
    return this.withErrorHandling(async () => {
      const [row] = await this.db
        .select({ id: smBaseSetups.id })
        .from(smBaseSetups)
        .innerJoin(smBaseGroups, eq(smBaseSetups.baseGroupId, smBaseGroups.id))
        .where(
          and(
            eq(smBaseGroups.name, "Gender"),
            eq(smBaseSetups.activeStatus, 1),
            eq(smBaseSetups.baseSetupName, name),
          ),
        )
        .limit(1);
      return row?.id ?? null;
    }, "resolveGenderId");
  }

  /** Slice 1: Resolve a studentCategoryId from a human-readable category name. Returns null if not found. */
  async resolveStudentCategoryId(name: string): Promise<number | null> {
    if (!name) return null;
    return this.withErrorHandling(async () => {
      const [row] = await this.db
        .select({ id: smStudentCategories.id })
        .from(smStudentCategories)
        .where(eq(smStudentCategories.categoryName, name))
        .limit(1);
      return row?.id ?? null;
    }, "resolveStudentCategoryId");
  }

  /** Slice 1: Fetch a student's rollNo and admissionNo in one round trip. Used by grading tool to avoid hard-coded 1s (B4). */
  async getRollNoAndAdmissionNo(studentId: number): Promise<{ rollNo: number | null; admissionNo: number | null }> {
    if (!studentId) return { rollNo: null, admissionNo: null };
    return this.withErrorHandling(async () => {
      const [row] = await this.db
        .select({ rollNo: smStudents.rollNo, admissionNo: smStudents.admissionNo })
        .from(smStudents)
        .where(eq(smStudents.id, studentId))
        .limit(1);
      return {
        rollNo: row?.rollNo ?? null,
        admissionNo: row?.admissionNo ?? null,
      };
    }, "getRollNoAndAdmissionNo");
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
          eq(smClasses.academicId, academicId),
        ),
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
          like(sql`CONCAT(${smClasses.className}, ${smSections.sectionName})`, searchPattern),
        ) as any,
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
  async assignClassSection(
    params: {
      studentId: number;
      classId: number;
      sectionId: number;
    },
    tx?: MySQLDrizzleClient,
  ) {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const { studentId, classId, sectionId } = params;
      const academicId = await this.getAcademicId();

      // Upsert destination record
      const [existingDest] = await db
        .select({ id: studentRecords.id })
        .from(studentRecords)
        .where(and(eq(studentRecords.studentId, studentId), eq(studentRecords.academicId, academicId)))
        .limit(1);

      if (existingDest) {
        await db
          .update(studentRecords)
          .set({ activeStatus: 1, isDefault: 1, classId, sectionId })
          .where(eq(studentRecords.id, existingDest.id));
      } else {
        await db.insert(studentRecords).values({
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

      // Sync sm_students as well for consistency in denormalized fields
      await db.update(smStudents).set({ classId, sectionId }).where(eq(smStudents.id, studentId));

      return true;
    }, "assignClassSection");
  }

  /**
   * Promotes a student to a new class/session while preserving history, assigning fees, and updating chat groups.
   */
  async promoteStudent(params: {
    studentId: number;
    classId: number;
    sectionId: number;
    sessionId?: number;
    rollNo?: number;
    resultStatus?: string;
  }) {
    return this.withErrorHandling(async () => {
      const currentAcademicId = await this.getAcademicId();
      const targetAcademicId = params.sessionId || currentAcademicId;
      const { studentId, classId, sectionId, rollNo, resultStatus = "PASSED" } = params;

      return await this.db.transaction(async (tx) => {
        // 1. Fetch current student state for audit log
        const [student] = await tx.select().from(smStudents).where(eq(smStudents.id, studentId)).limit(1);
        if (!student) throw new Error("STUDENT_NOT_FOUND");

        const [currentRecord] = await tx
          .select()
          .from(studentRecords)
          .where(
            and(
              eq(studentRecords.studentId, studentId),
              eq(studentRecords.isDefault, 1),
              eq(studentRecords.academicId, currentAcademicId),
            ),
          )
          .limit(1);

        // 2. Create Audit Record in sm_student_promotions
        await tx.insert(smStudentPromotions).values({
          studentId,
          previousClassId: student.classId,
          previousSectionId: student.sectionId,
          previousSessionId: currentAcademicId,
          currentClassId: classId,
          currentSectionId: sectionId,
          currentSessionId: targetAcademicId,
          previousRollNumber: student.rollNo,
          currentRollNumber: rollNo || student.rollNo,
          resultStatus,
          studentInfo: JSON.stringify(student),
          admissionNumber: student.admissionNo,
          schoolId: student.schoolId,
          createdAt: new Date(),
        });

        // 3. Complete Roll Number logic
        const finalRollNo = rollNo ?? (await this.getNextRollNo(classId, sectionId, targetAcademicId, tx));

        // 4. Update existing current record
        if (currentRecord) {
          await tx
            .update(studentRecords)
            .set({ isDefault: 0, isPromote: 1 })
            .where(eq(studentRecords.id, currentRecord.id));
        }

        // 5. Insert new record for target session
        const [newRecord] = await tx
          .insert(studentRecords)
          .values({
            studentId,
            classId,
            sectionId,
            academicId: targetAcademicId,
            sessionId: targetAcademicId,
            schoolId: student.schoolId || 1,
            isDefault: 1,
            isPromote: 0,
            activeStatus: 1,
          })
          .$returningId();

        // 6. Update main student table
        await tx
          .update(smStudents)
          .set({
            classId,
            sectionId,
            sessionId: targetAcademicId,
            academicId: targetAcademicId,
            rollNo: finalRollNo,
          })
          .where(eq(smStudents.id, studentId));

        // 7. Auto-Assign Fees (assignDirectFees)
        const classMasters = await tx
          .select()
          .from(smFeesMasters)
          .where(
            and(
              eq(smFeesMasters.classId, classId),
              eq(smFeesMasters.academicId, targetAcademicId),
              eq(smFeesMasters.activeStatus, 1),
            ),
          );

        for (const master of classMasters) {
          await tx.insert(smFeesAssigns).values({
            studentId,
            recordId: newRecord.id,
            feesMasterId: master.id,
            feesAmount: master.amount,
            academicId: targetAcademicId,
            schoolId: student.schoolId || 1,
            activeStatus: 1,
          });
        }

        // 8. Chat Group Migration
        if (student.userId) {
          const oldGroups = await tx
            .select({ id: chatGroups.id })
            .from(chatGroups)
            .where(
              and(
                eq(chatGroups.classId, student.classId || 0),
                eq(chatGroups.sectionId, student.sectionId || 0),
                eq(chatGroups.academicId, currentAcademicId),
              ),
            );

          if (oldGroups.length > 0) {
            await tx.delete(chatGroupUsers).where(
              and(
                inArray(
                  chatGroupUsers.groupId,
                  oldGroups.map((g) => g.id),
                ),
                eq(chatGroupUsers.userId, student.userId),
              ),
            );
          }

          const newGroups = await tx
            .select({ id: chatGroups.id })
            .from(chatGroups)
            .where(
              and(
                eq(chatGroups.classId, classId),
                eq(chatGroups.sectionId, sectionId),
                eq(chatGroups.academicId, targetAcademicId),
              ),
            );

          for (const g of newGroups) {
            await tx.insert(chatGroupUsers).values({
              groupId: g.id,
              userId: student.userId,
              role: 1,
              addedBy: 1,
              createdAt: new Date(),
            });
          }
        }

        return true;
      });
    }, "promoteStudent");
  }

  private async getNextRollNo(
    classId: number,
    sectionId: number,
    academicId: number,
    tx: MySQLDrizzleClient,
  ): Promise<number> {
    const [lastRoll] = await tx
      .select({ rollNo: smStudents.rollNo })
      .from(smStudents)
      .where(
        and(
          eq(smStudents.classId, classId),
          eq(smStudents.sectionId, sectionId),
          eq(smStudents.academicId, academicId),
        ),
      )
      .orderBy(desc(smStudents.rollNo))
      .limit(1);

    return (lastRoll?.rollNo ?? 0) + 1;
  }

  /**
   * Finds the last admission number and increments it by one.
   * @returns The last admission number found, or 0 if none exist.
   */
  private async getLastAdmissionNo(): Promise<number> {
    const [lastAdmission] = await this.db
      .select({ admissionNo: smStudents.admissionNo })
      .from(smStudents)
      .orderBy(desc(smStudents.admissionNo))
      .limit(1);

    return lastAdmission?.admissionNo ?? 0;
  }

  async searchStudent(query: string, filter?: { classId?: number | null; sectionId?: number | null }) {
    return this.withErrorHandling(async () => {
      const searchPattern = `%${query}%`;
      const conds: Array<ReturnType<typeof like> | ReturnType<typeof eq>> = [
        like(smStudents.fullName, searchPattern),
        eq(studentRecords.isDefault, 1), // Only show their active/default class
      ];
      if (filter?.classId != null) {
        conds.push(eq(studentRecords.classId, filter.classId));
      }
      if (filter?.sectionId != null) {
        conds.push(eq(studentRecords.sectionId, filter.sectionId));
      }
      const students = await this.db
        .select({
          studentId: smStudents.id,
          fullName: smStudents.fullName,
          admissionNo: smStudents.admissionNo,
          className: smClasses.className,
          sectionName: smSections.sectionName,
          activeStatus: smStudents.activeStatus,
        })
        .from(smStudents)
        .leftJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
        .leftJoin(smClasses, eq(studentRecords.classId, smClasses.id))
        .leftJoin(smSections, eq(studentRecords.sectionId, smSections.id))
        .where(and(...conds))
        .limit(20);

      return students;
    }, "searchStudent");
  }

  async updateStudentStatus(params: { studentId: number; active: boolean }) {
    return this.withErrorHandling(async () => {
      const { studentId, active } = params;
      const [student] = await this.db.select().from(smStudents).where(eq(smStudents.id, studentId)).limit(1);

      if (!student) {
        throw new Error("USER_NOT_FOUND");
      }

      const activeStatus = active ? 1 : 0;

      // Update student table
      await this.db.update(smStudents).set({ activeStatus }).where(eq(smStudents.id, studentId));

      // Update student_records table
      await this.db
        .update(studentRecords)
        .set({ activeStatus })
        .where(eq(studentRecords.studentId, studentId));

      // Update user table only if userId exists
      if (student.userId) {
        await this.db.update(users).set({ activeStatus }).where(eq(users.id, student.userId));
      }

      return {
        success: true,
        studentId,
        fullName: student.fullName,
        active,
      };
    }, "updateStudentStatus");
  }

  async deleteStudent(params: { studentId: number }) {
    return this.withErrorHandling(async () => {
      const { studentId } = params;
      const [student] = await this.db.select().from(smStudents).where(eq(smStudents.id, studentId)).limit(1);

      if (!student) {
        throw new Error("USER_NOT_FOUND");
      }

      // 1. Delete Student Records
      await this.db.delete(studentRecords).where(eq(studentRecords.studentId, studentId));

      // 2. Delete Student
      await this.db.delete(smStudents).where(eq(smStudents.id, studentId));

      // 3. Delete associated User account
      if (student.userId) {
        await this.db.delete(users).where(eq(users.id, student.userId));
      }

      // Note: We leave the smParents record intact, as they may have other children enrolled.

      return {
        success: true,
        studentId,
        fullName: student.fullName,
      };
    }, "deleteStudent");
  }
}

// ✅ Singleton export — the only one you need
// export const studentRepo = await StudentRepository.build();
