// /src/lib/server/repository/student.repo.ts

import { and, eq } from "drizzle-orm";
import {
  infixRoles,
  smAssignSubjects,
  smBaseSetups,
  smClasses,
  smDesignations,
  smHumanDepartments,
  smParents,
  smSections,
  smStaffs,
  smStudentCategories,
  smStudents,
  studentRecords,
  users,
} from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";
import { hashPwd } from "$lib/server/helpers/utils";

export type StaffDetails = {
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

export type StaffDesignation = {
  id: number;
  title: string | null;
};

export type StaffDepartment = {
  id: number;
  title: string | null;
};

export type StaffRow = typeof smStaffs.$inferSelect;

export class StaffRepository extends BaseRepository {
  async getStaffRegistrationOptions() {
    return this.withErrorHandling(async () => {
      const designations = await this.db
        .select({ id: smDesignations.id, name: smDesignations.title })
        .from(smDesignations)
        .where(eq(smDesignations.activeStatus, 1));

      const departments = await this.db
        .select({ id: smHumanDepartments.id, name: smHumanDepartments.name })
        .from(smHumanDepartments)
        .where(eq(smHumanDepartments.activeStatus, 1));

      const roles = await this.db
        .select({ id: infixRoles.id, name: infixRoles.name })
        .from(infixRoles)
        .where(eq(infixRoles.activeStatus, 1));

      const genders = await this.db
        .select({ id: smBaseSetups.id, name: smBaseSetups.baseSetupName })
        .from(smBaseSetups)
        .where(and(eq(smBaseSetups.activeStatus, 1), eq(smBaseSetups.baseGroupId, 1))); // Assuming baseGroupId 1 is for gender

      return {
        designations,
        departments,
        roles,
        genders,
      };
    }, "getStaffRegistrationOptions");
  }

  async createStaff(input: {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    designationId: number;
    departmentId: number;
    roleId: number;
    genderId: number;
    qualification?: string;
    experience?: string;
    schoolId?: number;
  }) {
    // Check if user already exists outside withErrorHandling to avoid generic DB error wrapping
    const [existingUser] = await this.db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (existingUser) {
      throw new Error("USER_EXISTS");
    }

    return this.withErrorHandling(async () => {
      const schoolId = input.schoolId || 1;
      const fullName = `${input.firstName} ${input.lastName}`.trim();
      const password = Math.random().toString(36).slice(-8); // Temporary password

      const [user] = await this.db.insert(users).values({
        fullName,
        email: input.email,
        phoneNumber: input.mobile,
        roleId: input.roleId,
        password: hashPwd(password),
        activeStatus: 1,
        schoolId,
        walletBalance: 0,
      });

      const userId = user.insertId;

      const [staff] = await this.db.insert(smStaffs).values({
        firstName: input.firstName,
        lastName: input.lastName,
        fullName,
        email: input.email,
        mobile: input.mobile,
        qualification: input.qualification,
        experience: input.experience,
        designationId: input.designationId,
        departmentId: input.departmentId,
        roleId: input.roleId,
        genderId: input.genderId,
        userId: userId,
        schoolId,
        activeStatus: 1,
      });

      return {
        id: staff.insertId,
        userId,
        fullName,
        email: input.email,
        password, // Return plain password for the UI to show once
      };
    }, "createStaff");
  }

  async searchStaff(filters: { departmentId?: number; designationId?: number }) {
    return this.withErrorHandling(async () => {
      const { departmentId, designationId } = filters;

      if (departmentId || designationId) {
        // Search by department or designation
        const conditions = [eq(smStaffs.activeStatus, 1)];
        if (departmentId) conditions.push(eq(smStaffs.departmentId, departmentId));
        if (designationId) conditions.push(eq(smStaffs.designationId, designationId));

        const staffList = await this.db
          .select({
            teacherId: smStaffs.id,
            fullName: smStaffs.fullName,
            email: smStaffs.email,
            designation: smDesignations.title,
            department: smHumanDepartments.name,
          })
          .from(smStaffs)
          .leftJoin(smDesignations, eq(smStaffs.designationId, smDesignations.id))
          .leftJoin(smHumanDepartments, eq(smStaffs.departmentId, smHumanDepartments.id))
          .where(and(...conditions));

        return staffList.map(a => ({
          teacherId: a.teacherId,
          fullName: a.fullName,
          email: a.email,
          designation: a.designation,
          department: a.department,
        }));
      }
      return [];
    }, "searchStaff");
  }

  async updateStaffStatus(params: { email?: string; teacherId?: number; active: boolean }) {
    return this.withErrorHandling(async () => {
      const { email, teacherId, active } = params;
      let user;

      // Find user by either email or teacherId (staff id)
      if (email) {
        [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
      } else if (teacherId) {
        const [staff] = await this.db.select().from(smStaffs).where(eq(smStaffs.id, teacherId)).limit(1);
        if (staff && staff.userId) {
          [user] = await this.db.select().from(users).where(eq(users.id, staff.userId)).limit(1);
        }
      }
      
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      const activeStatus = active ? 1 : 0;

      // Update users table
      await this.db.update(users).set({ activeStatus }).where(eq(users.id, user.id));

      // Update sm_staffs table
      await this.db.update(smStaffs).set({ activeStatus }).where(eq(smStaffs.userId, user.id));

      return {
        success: true,
        email: user.email,
        fullName: user.fullName,
        active,
      };
    }, "updateStaffStatus");
  }

  async deleteStaff(params: { email?: string; teacherId?: number }) {
    return this.withErrorHandling(async () => {
      const { email, teacherId } = params;
      let user;

      // Find user by either email or teacherId (staff id)
      if (email) {
        [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
      } else if (teacherId) {
        const [staff] = await this.db.select().from(smStaffs).where(eq(smStaffs.id, teacherId)).limit(1);
        if (staff && staff.userId) {
          [user] = await this.db.select().from(users).where(eq(users.id, staff.userId)).limit(1);
        }
      }
      
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      // Delete from sm_staffs table first (foreign key dependency usually dictates this order)
      await this.db.delete(smStaffs).where(eq(smStaffs.userId, user.id));

      // Delete from users table
      await this.db.delete(users).where(eq(users.id, user.id));

      return {
        success: true,
        email: user.email,
        fullName: user.fullName,
      };
    }, "deleteStaff");
  }

  async getStaffByClassSection(params: { classId: number; sectionId: number }) {
    const { classId, sectionId } = params;
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const [classSection] = await this.db
        .select({
          teacherId: smAssignSubjects.teacherId,
          classId: smAssignSubjects.classId,
          sectionId: smAssignSubjects.sectionId,
          subjectId: smAssignSubjects.subjectId,
        })
        .from(smAssignSubjects)
        .where(
          and(
            eq(smAssignSubjects.classId, classId),
            eq(smAssignSubjects.sectionId, sectionId),
            eq(smAssignSubjects.activeStatus, 1),
            eq(smAssignSubjects.academicId, academicId)
          )
        )
        .limit(1);
      return classSection;
    }, "getStaffClassSection");
  }
}

// ✅ Singleton export — the only one you need
// export const staffRepo = await StaffRepository.build();
