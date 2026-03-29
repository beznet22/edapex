export type AttendanceStatus = "P" | "L" | "A" | "H" | "F"; // Present, Late, Absent, Holiday, Half-day

export interface IStudentAttendance {
  id: number;
  tenantId: number;
  enrollmentId: number;
  userId: number;
  classId: number;
  sectionId: number;
  attendanceDate: string;
  status: AttendanceStatus;
  note: string | null;
  academicId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IStaffAttendance {
  id: number;
  tenantId: number;
  staffId: number;
  userId: number;
  attendanceDate: string;
  status: AttendanceStatus;
  note: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAttendanceRepository {
  // Student
  getStudentAttendance(enrollmentId: number, month: string, year: string): Promise<IStudentAttendance[]>;
  bulkSaveStudentAttendance(data: Partial<IStudentAttendance>[]): Promise<void>;
  
  // Staff
  getStaffAttendance(staffId: number, month: string, year: string): Promise<IStaffAttendance[]>;
  saveStaffAttendance(data: Partial<IStaffAttendance>): Promise<IStaffAttendance>;
  
  // Reports
  getDailyAttendanceStats(tenantId: number, date: string): Promise<{
    students: { total: number; present: number; absent: number };
    staff: { total: number; present: number; absent: number };
  }>;
}
