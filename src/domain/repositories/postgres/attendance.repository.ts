import { db } from "../../../db/index.js";
import { 
  attendances 
} from "../../../db/postgres/domain-attendance.js";
import { 
  IAttendanceRepository, 
  IStudentAttendance, 
  IStaffAttendance,
  AttendanceStatus
} from "../../interfaces/attendance.interface.js";
import { eq, and, sql } from "drizzle-orm";

export class PostgresAttendanceRepository implements IAttendanceRepository {
  private mapStudentAttendance(row: any): IStudentAttendance {
    return {
      ...row,
      status: this.mapStatus(row.status),
      note: row.metadata?.notes || null,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapStaffAttendance(row: any): IStaffAttendance {
    return {
      ...row,
      staffId: row.userId,
      status: this.mapStatus(row.status),
      note: row.metadata?.notes || null,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapStatus(dbStatus: string): AttendanceStatus {
    switch (dbStatus) {
      case "present": return "P";
      case "absent": return "A";
      case "late": return "L";
      case "half_day": return "F";
      case "excused": return "H";
      default: return "A";
    }
  }

  private reverseMapStatus(domainStatus: AttendanceStatus): "present" | "absent" | "late" | "half_day" | "excused" {
    switch (domainStatus) {
      case "P": return "present";
      case "A": return "absent";
      case "L": return "late";
      case "F": return "half_day";
      case "H": return "excused";
      default: return "absent";
    }
  }

  // --- Student ---
  async getStudentAttendance(enrollmentId: number, month: string, year: string): Promise<IStudentAttendance[]> {
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;
    const results = await db
      .select()
      .from(attendances)
      .where(and(
        eq(attendances.enrollmentId, enrollmentId),
        eq(attendances.actorType, "student"),
        sql`${attendances.attendanceDate} BETWEEN ${startDate} AND ${endDate}`
      ));
    return results.map((row: any) => this.mapStudentAttendance(row));
  }

  async bulkSaveStudentAttendance(data: Partial<IStudentAttendance>[]): Promise<void> {
    const values = data.map(item => ({
      tenantId: item.tenantId!,
      userId: item.userId!,
      actorType: "student" as const,
      scopeType: "daily" as const,
      attendanceDate: item.attendanceDate!,
      enrollmentId: item.enrollmentId!,
      classId: item.classId!,
      sectionId: item.sectionId!,
      status: this.reverseMapStatus(item.status!),
      academicId: item.academicId!,
      metadata: item.note ? { notes: item.note } : {}
    }));
    
    for (const val of values) {
      await db.insert(attendances)
        .values(val as any)
        .onConflictDoUpdate({
          target: [attendances.userId, attendances.attendanceDate, attendances.academicId], // Assuming this unique constraint
          set: { status: val.status, metadata: val.metadata }
        });
    }
  }

  // --- Staff ---
  async getStaffAttendance(staffId: number, month: string, year: string): Promise<IStaffAttendance[]> {
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;
    const results = await db
      .select()
      .from(attendances)
      .where(and(
        eq(attendances.userId, staffId),
        eq(attendances.actorType, "staff"),
        sql`${attendances.attendanceDate} BETWEEN ${startDate} AND ${endDate}`
      ));
    return results.map((row: any) => this.mapStaffAttendance(row));
  }

  async saveStaffAttendance(data: Partial<IStaffAttendance>): Promise<IStaffAttendance> {
    const val = {
      tenantId: data.tenantId!,
      userId: data.staffId!,
      actorType: "staff" as const,
      scopeType: "daily" as const,
      attendanceDate: data.attendanceDate!,
      status: this.reverseMapStatus(data.status!),
      metadata: data.note ? { notes: data.note } : {}
    };
    
    const [result] = await db.insert(attendances)
      .values(val as any)
      .onConflictDoUpdate({
        target: [attendances.userId, attendances.attendanceDate, attendances.academicId],
        set: { status: val.status, metadata: val.metadata }
      })
      .returning();
    
    return this.mapStaffAttendance(result);
  }

  // --- Reports ---
  async getDailyAttendanceStats(tenantId: number, date: string): Promise<{
    students: { total: number; present: number; absent: number };
    staff: { total: number; present: number; absent: number };
  }> {
    const results = await db
      .select({
        actorType: attendances.actorType,
        status: attendances.status,
        count: sql<number>`count(*)`
      })
      .from(attendances)
      .where(and(
        eq(attendances.tenantId, tenantId),
        eq(attendances.attendanceDate, date)
      ))
      .groupBy(attendances.actorType, attendances.status);

    const stats = {
      students: { total: 0, present: 0, absent: 0 },
      staff: { total: 0, present: 0, absent: 0 }
    };

    results.forEach((row: { actorType: "student" | "staff", status: string, count: number }) => {
      const type = row.actorType === "student" ? "students" : "staff";
      stats[type].total += Number(row.count);
      if (row.status === "present") stats[type].present += Number(row.count);
      if (row.status === "absent") stats[type].absent += Number(row.count);
    });

    return stats;
  }
}
