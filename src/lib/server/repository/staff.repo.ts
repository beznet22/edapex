// /src/lib/server/repository/student.repo.ts

import { and, eq } from "drizzle-orm";
import {
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
} from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";

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
  async getStaffById(id: number): Promise<StaffRow | null> {
    const [staff] = await this.db.select().from(smStaffs).where(eq(smStaffs.id, id)).limit(1);
    return staff || null;
  }

  async getStaffByUserId(userId: number): Promise<StaffRow | null> {
    const [staff] = await this.db.select().from(smStaffs).where(eq(smStaffs.userId, userId)).limit(1);
    return staff || null;
  }

  async getStaffByUserEmail(email: string): Promise<StaffRow | null> {
    const [staff] = await this.db.select().from(smStaffs).where(eq(smStaffs.email, email)).limit(1);
    return staff || null;
  }

  async getDesignationByUserId(userId: number): Promise<StaffDesignation | null> {
    const [designation] = await this.db
      .select({ id: smDesignations.id, title: smDesignations.title })
      .from(smDesignations)
      .innerJoin(smStaffs, eq(smDesignations.id, smStaffs.designationId))
      .where(eq(smStaffs.userId, userId))
      .limit(1);
      
    return designation || null;
  }

  async getDepartmentByUserId(userId: number): Promise<StaffDepartment | null> {
    const [department] = await this.db
      .select({ id: smHumanDepartments.id, title: smHumanDepartments.name })
      .from(smHumanDepartments)
      .innerJoin(smStaffs, eq(smHumanDepartments.id, smStaffs.departmentId))
      .where(eq(smStaffs.userId, userId))
      .limit(1);
    return department || null;
  }
}

// ✅ Singleton export — the only one you need
export const staffRepo = await StaffRepository.build();
