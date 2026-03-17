// /src/lib/server/repository/student.repo.ts

import { and, count, eq, isNotNull, ne, sql, like, or, desc, asc, inArray } from "drizzle-orm";
import { type MySQLDrizzleClient } from "./base.repo";
import {
  tenants,
  academicYears,
  accounts,
  users,
  enumerations,
} from "$lib/server/db/domain-core";
import {
  classes,
  sections,
  enrollments,
  classSections,
  promotions,
  classTeachers,
} from "$lib/server/db/domain-academic";
import { settings } from "$lib/server/db/domain-settings";
import { BaseRepository } from "./base.repo";
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
      schoolId = 1,
      guardianRelation,
      guardiansName,
      guardiansMobile,
      guardiansEmail,
      siblingAdmissionNo,
    } = input;

    const academicId = input.academicId ?? (await this.getAcademicId());

    // Step 1: Check for existing account email conflicts (Identity Layer)
    if (email) {
      const [existingAccount] = await this.db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
      if (existingAccount) {
        throw new Error("ACCOUNT_EXISTS");
      }
    }

    return await this.db.transaction(async (tx) => {
      let parentUserId: number | null = null;
      let parentAccountId: string | null = null;

      // Step 2: Try to find existing parent persona via sibling or email
      let existingParentPersona: (typeof users.$inferSelect) | null = null;

      if (siblingAdmissionNo) {
        const results = await tx
          .select({ parent: users })
          .from(users)
          .where(and(eq(users.userType, "student"), sql`${users.metadata}->>'$.admissionNo' = ${siblingAdmissionNo}`))
          .limit(1);
        
        if (results.length > 0 && results[0].parent.parentUserId) {
           const [parent] = await tx.select().from(users).where(eq(users.id, results[0].parent.parentUserId)).limit(1);
           existingParentPersona = parent || null;
        }
      }

      if (!existingParentPersona && guardiansEmail) {
        const [parent] = await tx
          .select()
          .from(users)
          .where(and(eq(users.email, guardiansEmail), eq(users.userType, "parent")))
          .limit(1);
        if (parent) {
          existingParentPersona = parent;
        }
      }

      if (existingParentPersona) {
        parentUserId = existingParentPersona.id;
        parentAccountId = existingParentPersona.accountId;
      } else if (guardiansEmail) {
        const [existingAccount] = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.email, guardiansEmail))
          .limit(1);
        
        if (existingAccount) {
          parentAccountId = existingAccount.id;
        }
      }

      // Step 3: Create parent Identity and Persona if not found
      if (!parentUserId) {
        if (!parentAccountId) {
          const parentPassword = Math.random().toString(36).slice(-8);
          parentAccountId = crypto.randomUUID();
          await tx
            .insert(accounts)
            .values({
              id: parentAccountId,
              email: guardiansEmail,
              password: hashPwd(parentPassword),
              tenantId: schoolId,
              activeStatus: 1,
            });
        }

        const [newParent] = await tx
          .insert(users)
          .values({
            tenantId: schoolId,
            accountId: parentAccountId,
            userType: "parent",
            firstName: guardiansName.split(' ')[0] || guardiansName,
            lastName: guardiansName.split(' ').slice(1).join(' ') || 'Parent',
            email: guardiansEmail,
            mobile: guardiansMobile,
            metadata: { guardianRelation: guardianRelation },
            activeStatus: 1,
          });
        parentUserId = (newParent as any).insertId;
      }

      // Step 4: Create student Identity and Persona
      const studentPassword = Math.random().toString(36).slice(-8);
      const studentAccountId = crypto.randomUUID();
      await tx
        .insert(accounts)
        .values({
          id: studentAccountId,
          email,
          phoneNumber: mobile,
          password: hashPwd(studentPassword),
          tenantId: schoolId,
          activeStatus: 1,
        });

      const finalAdmissionNo = admissionNo ?? ((await this.getLastAdmissionNo()) + 1);

      const [studentPersona] = await tx
        .insert(users)
        .values({
          tenantId: schoolId,
          accountId: studentAccountId,
          userType: "student",
          firstName,
          lastName,
          email,
          mobile,
          dateOfBirth,
          genderId,
          parentUserId: parentUserId,
          metadata: { admissionNo: finalAdmissionNo, studentCategoryId },
          activeStatus: 1,
        });
      const studentId = (studentPersona as any).insertId;

      // Step 5: Create Enrollment
      await tx.insert(enrollments).values({
        tenantId: schoolId,
        userId: studentId,
        classId,
        sectionId,
        academicId,
        rollNo: String(finalAdmissionNo),
        isDefault: 1,
        status: "active",
      });

      return {
        studentId,
        studentPassword,
      };
    });
  }

  async getStudentBySiblings() {
    const students = await this.db
      .select({
        studentId: users.id,
        admissionNo: sql<number>`${users.metadata}->>'$.admissionNo'`,
        fullName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        parentId: users.parentUserId,
      })
      .from(users)
      .where(and(
        eq(users.userType, "student"),
        eq(users.activeStatus, 1),
        isNotNull(users.parentUserId)
      ));

    return students || null;
  }

  async getStudentsByClassSection(params: { classId: number; sectionId: number }) {
    const { classId, sectionId } = params;
    if (!classId || !sectionId) return null;
    const academicId = await this.getAcademicId();
    
    const students = await this.db
      .select({
        id: users.id,
        name: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        admissionNo: sql<number>`CAST(${users.metadata}->>'$.admissionNo' AS UNSIGNED)`,
      })
      .from(users)
      .innerJoin(enrollments, eq(users.id, enrollments.userId))
      .where(
        and(
          eq(users.userType, "student"),
          eq(enrollments.classId, classId),
          eq(enrollments.sectionId, sectionId),
          eq(enrollments.academicId, academicId),
          eq(enrollments.status, "active"),
          eq(users.activeStatus, 1),
          eq(enrollments.isDefault, 1)
        )
      ).orderBy(asc(users.id));
    return students;
  }

  async getStudentsByStaffId(staffId?: number) {
    if (!staffId) return null;
    const academicId = await this.getAcademicId();
    
    const [assigned] = await this.db
      .select({
        id: classTeachers.id,
        teacherId: classTeachers.staffId,
        classId: classTeachers.classId,
        sectionId: classTeachers.sectionId,
        academicId: classTeachers.academicId
      })
      .from(classTeachers)
      .where(
        and(
          eq(classTeachers.staffId, staffId),
          eq(classTeachers.academicId, academicId)
        )
      )
      .limit(1);
    
    if (!assigned) return null;

    const students = await this.db
      .select({
        id: users.id,
        name: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        admissionNo: sql<number>`CAST(${users.metadata}->>'$.admissionNo' AS UNSIGNED)`,
      })
      .from(users)
      .innerJoin(enrollments, eq(users.id, enrollments.userId))
      .where(
        and(
          eq(users.userType, "student"),
          eq(enrollments.classId, assigned.classId),
          eq(enrollments.sectionId, assigned.sectionId),
          eq(enrollments.academicId, academicId),
          eq(users.activeStatus, 1)
        )
      )
      .groupBy(users.id);
    return students;
  }

  async createIfNotExistsEnrollment(params: {
    studentId?: number | null;
    classId?: number | null;
    sectionId?: number | null;
  }) {
    const { studentId, classId, sectionId } = params;
    if (!studentId || !classId || !sectionId) return null;
    const academicId = await this.getAcademicId();
    const [record] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, studentId),
          eq(enrollments.classId, classId),
          eq(enrollments.sectionId, sectionId),
          eq(enrollments.isDefault, 1),
          eq(enrollments.academicId, academicId),
          eq(enrollments.status, "active")
        )
      )
      .limit(1);
    if (record) return record.id;
    
    const [inserted] = await this.db.insert(enrollments).values({
      tenantId: this.tenant.tenantId,
      userId: studentId,
      classId,
      sectionId,
      isDefault: 1,
      academicId,
      status: "active",
    });
    
    return (inserted as any).insertId;
  }

  async getEnrollment(params: { classId: number; sectionId: number; studentId: number }) {
    const { classId, sectionId, studentId } = params;
    if (!classId || !sectionId || !studentId) return null;
    const academicId = await this.getAcademicId();
    const [record] = await this.db
      .select({
        id: enrollments.id,
        categoryId: sql<number>`${users.metadata}->>'$.studentCategoryId'`,
        fullName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        admissionNo: sql<number>`${users.metadata}->>'$.admissionNo'`,
      })
      .from(enrollments)
      .leftJoin(users, eq(enrollments.userId, users.id))
      .where(
        and(
          eq(enrollments.userId, studentId),
          eq(enrollments.classId, classId),
          eq(enrollments.sectionId, sectionId),
          eq(enrollments.isDefault, 1),
          eq(enrollments.academicId, academicId),
          eq(enrollments.status, "active")
        )
      )
      .limit(1);
    return record || null;
  }

  async getStudentRecordByAdmissionNo(admissionNo: number) {
    const academicId = await this.getAcademicId();
    const [record] = await this.db
      .select({
        id: users.id,
        accountId: users.accountId,
        enrollmentId: enrollments.id,
        classId: enrollments.classId,
        sectionId: enrollments.sectionId,
        studentId: users.id,
        isDefault: enrollments.isDefault,
        fullName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        admissionNo: sql<number>`${users.metadata}->>'$.admissionNo'`,
        parentId: users.parentUserId,
        tenantId: users.tenantId,
      })
      .from(users)
      .leftJoin(
        enrollments,
        and(
          eq(users.id, enrollments.userId),
          eq(enrollments.academicId, academicId),
          eq(enrollments.isDefault, 1),
          eq(enrollments.status, "active")
        )
      )
      .where(and(
        eq(users.userType, "student"),
        sql`${users.metadata}->>'$.admissionNo' = ${admissionNo}`,
        eq(users.activeStatus, 1)
      ))
      .limit(1);
    return record || null;
  }

  async updateStudent(student: Partial<StudentDetails> & { studentId: number }) {
    const updateData: Record<string, any> = {};
    if (student.firstName !== undefined) updateData.firstName = student.firstName;
    if (student.lastName !== undefined) updateData.lastName = student.lastName;
    if (student.dateOfBirth !== undefined) updateData.dateOfBirth = student.dateOfBirth;
    if (student.genderId !== undefined) updateData.genderId = student.genderId;
    
    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, student.studentId));
    
    if (student.firstName || student.lastName) {
       const [s] = await this.db.select({ accountId: users.accountId }).from(users).where(eq(users.id, student.studentId)).limit(1);
       if (s?.accountId) {
          const accountUpdate: any = {};
          if (student.firstName) accountUpdate.firstName = student.firstName;
          if (student.lastName) accountUpdate.lastName = student.lastName;
          await this.db.update(accounts).set(accountUpdate).where(eq(accounts.id, s.accountId));
       }
    }

    return updated;
  }

  async updateStudentPhoto(studentId: number, photoPath: string) {
    const [updated] = await this.db
      .update(users)
      .set({ photo: photoPath })
      .where(eq(users.id, studentId));

    return (updated as any).affectedRows > 0;
  }

  async updateStudentCategoryId(studentId: number, studentCategoryId: number, tx?: MySQLDrizzleClient) {
    const db = tx || this.db;
    
    const [user] = await db.select({ metadata: users.metadata }).from(users).where(eq(users.id, studentId)).limit(1);
    if (!user) return false;

    const newMetadata = { ...(user.metadata as object || {}), studentCategoryId };

    const [updated] = await db
      .update(users)
      .set({ metadata: newMetadata })
      .where(eq(users.id, studentId));
    
    return (updated as any).affectedRows > 0;
  }

  async getStudentById(id?: number, isAdminNo = false): Promise<StudentDetails | null> {
    if (!id) return null;
    const academicId = await this.getAcademicId();
    
    const filter = isAdminNo ? sql`${users.metadata}->>'$.admissionNo' = ${id}` : eq(users.id, id);

    const [student] = await this.db
      .select({
        studentId: users.id,
        admissionNo: sql<number>`${users.metadata}->>'$.admissionNo'`,
        fullName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        mobile: users.mobile,
        studentPhoto: users.photo,
        dateOfBirth: users.dateOfBirth,
        genderName: enumerations.label,
        categoryName: sql<string>`NULL`, 
        parentId: users.parentUserId,
        guardiansName: sql<string>`NULL`, 
        guardiansMobile: sql<string>`NULL`,
        guardiansEmail: sql<string>`NULL`,
        classId: enrollments.classId,
        sectionId: enrollments.sectionId,
        className: classes.name,
        sectionName: sections.name,
        studentRecordId: enrollments.id,
        schoolId: enrollments.tenantId,
        academicId: enrollments.academicId,
        genderId: users.genderId,
        studentCategoryId: sql<number>`${users.metadata}->>'$.studentCategoryId'`,
        rollNo: sql<number>`CAST(${enrollments.rollNo} AS UNSIGNED)`,
      })
      .from(users)
      .leftJoin(enumerations, eq(users.genderId, enumerations.id))
      .leftJoin(
        enrollments,
        and(
          eq(users.id, enrollments.userId),
          eq(enrollments.academicId, academicId),
          eq(enrollments.isDefault, 1),
          eq(enrollments.status, "active")
        )
      )
      .leftJoin(classes, eq(enrollments.classId, classes.id))
      .leftJoin(sections, eq(enrollments.sectionId, sections.id))
      .where(and(
        eq(users.userType, "student"),
        filter,
        eq(users.activeStatus, 1)
      ))
      .limit(1);

    return student as any;
  }

  getStuendtsByParentId(parentId: number) {
    return this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(and(
        eq(users.parentUserId, parentId),
        eq(users.userType, "student"),
        eq(users.activeStatus, 1)
      ));
  }

  async getStudentRegistrationOptions() {
    const academicId = await this.getAcademicId();

    const [classList, sectionList, categoryList, genderList] = await Promise.all([
      this.db
        .select({ id: classes.id, name: classes.name })
        .from(classes)
        .where(and(eq(classes.activeStatus, 1), eq(classes.academicId, academicId))),

      this.db
        .select({ id: sections.id, name: sections.name })
        .from(sections)
        .where(eq(sections.activeStatus, 1)),

      this.db
        .select({ id: enumerations.id, name: enumerations.label })
        .from(enumerations)
        .where(eq(enumerations.domain, "student_category")),

      this.db
        .select({ id: enumerations.id, name: enumerations.label })
        .from(enumerations)
        .where(eq(enumerations.domain, "gender")),
    ]);

    return {
      classes: classList,
      sections: sectionList,
      categories: categoryList,
      genders: genderList,
      guardianRelations: [
        { value: "father", label: "Father" },
        { value: "mother", label: "Mother" },
        { value: "other", label: "Other" },
      ],
    };
  }

  async getClassAndSectionByName(className: string, sectionName: string) {
    const academicId = await this.getAcademicId();

    const [data] = await this.db
      .select({
        classId: classes.id,
        sectionId: sections.id,
      })
      .from(classSections)
      .innerJoin(classes, eq(classSections.classId, classes.id))
      .innerJoin(sections, eq(classSections.sectionId, sections.id))
      .where(
        and(
          eq(classes.name, className.toUpperCase()),
          eq(sections.name, sectionName.toUpperCase()),
          eq(classes.activeStatus, 1),
          eq(sections.activeStatus, 1),
          eq(classes.academicId, academicId)
        )
      )
      .limit(1);

    return data || null;
  }

  async searchClassSection(query?: string) {
    const academicId = await this.getAcademicId();

    const filters = [
      eq(classes.activeStatus, 1),
      eq(classes.academicId, academicId),
    ];
    
    if (query) {
       filters.push(like(classes.name, `%${query}%`));
    }

    const results = await this.db
      .select({
        classId: classes.id,
        className: classes.name,
        sectionId: sections.id,
        sectionName: sections.name,
      })
      .from(classSections)
      .innerJoin(classes, eq(classSections.classId, classes.id))
      .innerJoin(sections, eq(classSections.sectionId, sections.id))
      .where(and(...filters));

    return results;
  }

  async assignClassSection(params: {
    studentId: number;
    classId: number;
    sectionId: number;
  }, tx?: MySQLDrizzleClient) {
    return this.withErrorHandling(async () => {
      const db = tx || this.db;
      const { studentId, classId, sectionId } = params;
      const academicId = await this.getAcademicId();

      const [existingDest] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.userId, studentId),
            eq(enrollments.academicId, academicId),
            eq(enrollments.isDefault, 1)
          )
        )
        .limit(1);

      if (existingDest) {
        await db
          .update(enrollments)
          .set({ status: "active", isDefault: 1, classId, sectionId })
          .where(eq(enrollments.id, existingDest.id));
      } else {
        await db.insert(enrollments).values({
          tenantId: this.tenant.tenantId,
          userId: studentId,
          classId,
          sectionId,
          academicId,
          isDefault: 1,
          status: "active",
        });
      }

      return true;
    }, "assignClassSection");
  }

  async promoteStudent(params: {
    studentId: number;
    classId: number;
    sectionId: number;
    targetAcademicId: number;
    rollNo?: string;
    resultStatus: "promoted" | "retained" | "graduated" | "withdrawn";
  }) {
    return this.withErrorHandling(async () => {
      const { studentId, classId, sectionId, targetAcademicId, rollNo, resultStatus } = params;
      const currentAcademicId = await this.getAcademicId();

      return await this.db.transaction(async (tx) => {
        const [student] = await tx.select().from(users).where(eq(users.id, studentId)).limit(1);
        if (!student) throw new Error("STUDENT_NOT_FOUND");

        const [currentEnrollment] = await tx.select()
          .from(enrollments)
          .where(and(
            eq(enrollments.userId, studentId),
            eq(enrollments.academicId, currentAcademicId),
            eq(enrollments.isDefault, 1)
          ))
          .limit(1);

        await tx.insert(promotions).values({
          tenantId: student.tenantId,
          userId: studentId,
          fromClassId: currentEnrollment?.classId ?? 0,
          fromSectionId: currentEnrollment?.sectionId ?? 0,
          toClassId: classId,
          toSectionId: sectionId,
          fromAcademicId: currentAcademicId,
          toAcademicId: targetAcademicId,
          result: resultStatus,
          promotedBy: this.tenant.userId,
        });

        if (currentEnrollment) {
          await tx.update(enrollments)
            .set({ isDefault: 0, status: resultStatus })
            .where(eq(enrollments.id, currentEnrollment.id));
        }

        await tx.insert(enrollments).values({
          tenantId: student.tenantId,
          userId: studentId,
          classId,
          sectionId,
          academicId: targetAcademicId,
          rollNo: rollNo || currentEnrollment?.rollNo || "0",
          isDefault: 1,
          status: "active",
        });

        return true;
      });
    }, "promoteStudent");
  }

  private async getNextRollNo(classId: number, sectionId: number, academicId: number, tx: MySQLDrizzleClient): Promise<number> {
    const [lastRoll] = await tx
      .select({ rollNo: enrollments.rollNo })
      .from(enrollments)
      .where(and(
        eq(enrollments.classId, classId),
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.academicId, academicId)
      ))
      .orderBy(desc(enrollments.rollNo))
      .limit(1);

    return (Number(lastRoll?.rollNo) || 0) + 1;
  }

  private async getLastAdmissionNo(): Promise<number> {
    const [lastAdmission] = await this.db
      .select({ admissionNo: sql<number>`${users.metadata}->>'$.admissionNo'` })
      .from(users)
      .where(eq(users.userType, "student"))
      .orderBy(desc(sql`${users.metadata}->>'$.admissionNo'`))
      .limit(1);

    return Number(lastAdmission?.admissionNo) || 0;
  }

  async searchStudent(query: string) {
    return this.withErrorHandling(async () => {
      const searchPattern = `%${query}%`;
      const students = await this.db
        .select({
          studentId: users.id,
          fullName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
          admissionNo: sql<number>`${users.metadata}->>'$.admissionNo'`,
          className: classes.name,
          sectionName: sections.name,
          activeStatus: users.activeStatus,
        })
        .from(users)
        .leftJoin(enrollments, eq(users.id, enrollments.userId))
        .leftJoin(classes, eq(enrollments.classId, classes.id))
        .leftJoin(sections, eq(enrollments.sectionId, sections.id))
        .where(
          and(
            eq(users.userType, "student"),
            or(
              like(users.firstName, searchPattern),
              like(users.lastName, searchPattern),
              sql`${users.metadata}->>'$.admissionNo' LIKE ${searchPattern}`
            ),
            eq(enrollments.isDefault, 1)
          )
        )
        .limit(20);

      return students;
    }, "searchStudent");
  }

  async updateStudentStatus(params: { studentId: number; active: boolean }) {
    return this.withErrorHandling(async () => {
      const { studentId, active } = params;
      const activeStatus = active ? 1 : 0;

      const [student] = await this.db.select().from(users).where(eq(users.id, studentId)).limit(1);
      if (!student) throw new Error("USER_NOT_FOUND");

      await this.db.transaction(async (tx) => {
        await tx.update(users).set({ activeStatus }).where(eq(users.id, studentId));
        if (student.accountId) {
          await tx.update(accounts).set({ activeStatus }).where(eq(accounts.id, student.accountId));
        }
      });

      return {
        success: true,
        studentId,
        active,
      };
    }, "updateStudentStatus");
  }

  async deleteStudent(params: { studentId: number }) {
    return this.withErrorHandling(async () => {
      const { studentId } = params;
      const [student] = await this.db.select().from(users).where(eq(users.id, studentId)).limit(1);
      if (!student) throw new Error("USER_NOT_FOUND");

      await this.db.transaction(async (tx) => {
        await tx.delete(enrollments).where(eq(enrollments.userId, studentId));
        await tx.delete(users).where(eq(users.id, studentId));
        if (student.accountId) {
          await tx.delete(accounts).where(eq(accounts.id, student.accountId));
        }
      });

      return {
        success: true,
        studentId,
      };
    }, "deleteStudent");
  }
}
