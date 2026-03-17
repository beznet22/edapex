// /src/lib/server/repository/staff.repo.ts

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
  subjectAssignments,
} from "$lib/server/db/domain-academic";
import { hrDepartments, hrDesignations } from "$lib/server/db/domain-hr";
import { BaseRepository } from "./base.repo";
import { hashPwd } from "$lib/server/helpers/utils";
import { type MySQLDrizzleClient } from "./base.repo";
import { and, eq, like, or, sql, asc, desc } from "drizzle-orm";

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

export type StaffRow = typeof users.$inferSelect;

export class StaffRepository extends BaseRepository {
  async getStaffRegistrationOptions() {
    return this.withErrorHandling(async () => {
      const designations = await this.db
        .select({ id: hrDesignations.id, name: hrDesignations.designationName })
        .from(hrDesignations);

      const departments = await this.db
        .select({ id: hrDepartments.id, name: hrDepartments.departmentName })
        .from(hrDepartments);

      const roles = await this.db
        .select({ id: enumerations.id, name: enumerations.label })
        .from(enumerations)
        .where(eq(enumerations.domain, "staff_role"));

      const genders = await this.db
        .select({ id: enumerations.id, name: enumerations.label })
        .from(enumerations)
        .where(eq(enumerations.domain, "gender"));

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
    // Check if identity already exists
    const [existingAccount] = await this.db.select().from(accounts).where(eq(accounts.email, input.email)).limit(1);
    if (existingAccount) {
      throw new Error("USER_EXISTS");
    }

    return this.withErrorHandling(async () => {
      const schoolId = input.schoolId || 1;
      const password = Math.random().toString(36).slice(-8); // Temporary password

      return await this.db.transaction(async (tx) => {
        // 1. Create Identity (Account)
        const accountId = crypto.randomUUID();
        await tx.insert(accounts).values({
          id: accountId,
          tenantId: schoolId,
          email: input.email,
          phoneNumber: input.mobile,
          password: hashPwd(password),
          activeStatus: 1,
        });

        // 2. Create Persona (User)
        const [staff] = await tx.insert(users).values({
          tenantId: schoolId,
          accountId: accountId,
          userType: "staff",
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          mobile: input.mobile,
          genderId: input.genderId,
          activeStatus: 1,
          metadata: {
            staffNumber: `${Date.now()}`,
            joiningDate: new Date().toISOString().split('T')[0],
            designationId: input.designationId,
            departmentId: input.departmentId,
            roleId: input.roleId,
            qualification: input.qualification,
            experience: input.experience,
          }
        });
        const staffId = (staff as any).insertId;

        return {
          id: staffId,
          accountId,
          fullName: `${input.firstName} ${input.lastName}`,
          email: input.email,
          password,
        };
      });
    }, "createStaff");
  }

  async searchStaff(filters: { departmentId?: number; designationId?: number; query?: string }) {
    return this.withErrorHandling(async () => {
      const { departmentId, designationId, query } = filters;

      const conditions = [
        eq(users.userType, "staff"),
        eq(users.activeStatus, 1)
      ];

      if (departmentId) conditions.push(sql`${users.metadata}->>'$.departmentId' = ${departmentId}`);
      if (designationId) conditions.push(sql`${users.metadata}->>'$.designationId' = ${designationId}`);
      if (query) {
        const searchCond = or(
          like(users.firstName, `%${query}%`),
          like(users.lastName, `%${query}%`),
          like(users.email, `%${query}%`)
        );
        if (searchCond) conditions.push(searchCond);
      }

      const staffList = await this.db
        .select({
          teacherId: users.id,
          fullName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
          email: users.email,
          mobile: users.mobile,
          activeStatus: users.activeStatus,
        })
        .from(users)
        .where(and(...(conditions as any[])))
        .orderBy(asc(users.id))
        .limit(100);

      return staffList;
    }, "searchStaff");
  }

  async updateStaffStatus(params: { email?: string; teacherId?: number; active: boolean }) {
    return this.withErrorHandling(async () => {
      const { email, teacherId, active } = params;
      let staff;

      if (email) {
        [staff] = await this.db.select().from(users).where(and(eq(users.email, email), eq(users.userType, "staff"))).limit(1);
      } else if (teacherId) {
        [staff] = await this.db.select().from(users).where(eq(users.id, teacherId)).limit(1);
      }
      
      if (!staff) throw new Error("USER_NOT_FOUND");

      const activeStatus = active ? 1 : 0;

      await this.db.transaction(async (tx) => {
        // 1. Update Persona (User)
        await tx.update(users).set({ activeStatus }).where(eq(users.id, staff.id));

        // 2. Update Account (Identity)
        if (staff.accountId) {
          await tx.update(accounts).set({ activeStatus }).where(eq(accounts.id, staff.accountId));
        }
      });

      return {
        success: true,
        email: staff.email,
        active,
      };
    }, "updateStaffStatus");
  }

  async deleteStaff(params: { email?: string; teacherId?: number }) {
    return this.withErrorHandling(async () => {
      const { email, teacherId } = params;
      let staff;

      if (email) {
        [staff] = await this.db.select().from(users).where(and(eq(users.email, email), eq(users.userType, "staff"))).limit(1);
      } else if (teacherId) {
        [staff] = await this.db.select().from(users).where(eq(users.id, teacherId)).limit(1);
      }
      
      if (!staff) throw new Error("USER_NOT_FOUND");

      await this.db.transaction(async (tx) => {
        // 1. Delete Persona (User)
        await tx.delete(users).where(eq(users.id, staff.id));

        // 2. Delete Account (Identity)
        if (staff.accountId) {
          await tx.delete(accounts).where(eq(accounts.id, staff.accountId));
        }
      });

      return {
        success: true,
        email: staff.email,
      };
    }, "deleteStaff");
  }

  async getStaffByClassSection(params: { classId: number; sectionId: number }) {
    const { classId, sectionId } = params;
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const [assignment] = await this.db
        .select({
          id: classTeachers.id,
          teacherId: classTeachers.staffId,
          classId: classTeachers.classId,
          sectionId: classTeachers.sectionId,
          academicId: classTeachers.academicId,
          createdAt: classTeachers.createdAt
        })
        .from(classTeachers)
        .where(
          and(
            eq(classTeachers.classId, classId),
            eq(classTeachers.sectionId, sectionId),
            eq(classTeachers.academicId, academicId)
          )
        )
        .limit(1);
      return assignment;
    }, "getStaffClassSection");
  }
}

// ✅ Singleton export — the only one you need
// export const staffRepo = await StaffRepository.build();
