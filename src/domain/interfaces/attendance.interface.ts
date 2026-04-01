export type AttendanceStatus = "P" | "L" | "A" | "H" | "F"; // Present, Late, Absent, Holiday, Half-day

export interface IStudentAttendance {
  id: string;
  tenantId: string;
  enrollmentId: string;
  userId: string;
  classId: string;
  sectionId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  note: string | null;
  academicId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IStaffAttendance {
  id: string;
  tenantId: string;
  staffId: string;
  userId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  note: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAttendanceRepository {
  // Student
  getStudentAttendance(tenantId: string, enrollmentId: string, month: string, year: string): Promise<IStudentAttendance[]>;
  bulkSaveStudentAttendance(data: Partial<IStudentAttendance>[]): Promise<void>;
  
  // Staff
  getStaffAttendance(tenantId: string, staffId: string, month: string, year: string): Promise<IStaffAttendance[]>;
  saveStaffAttendance(data: Partial<IStaffAttendance>): Promise<IStaffAttendance>;
  
  // Reports
  getDailyAttendanceStats(tenantId: string, date: string): Promise<{
    students: { total: number; present: number; absent: number };
    staff: { total: number; present: number; absent: number };
  }>;
}
