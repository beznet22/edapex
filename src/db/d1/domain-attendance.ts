/**
 * ARCHITECTURE OVERVIEW: Attendance Domain
 * 
 * Purpose:
 * Consolidates discrete legacy attendance tables into a single high-performance 
 * `edx_attendances` model. Utilizes heavily optimized indexing strategies on 
 * `attendance_date`, `account_id`, and `tenant_id` to compute absenteeism metrics 
 * at scale and natively map absent events.
 * 
 * Replaces Legacy Tables:
 * - sm_student_attendances
 * - sm_staff_attendences
 * - sm_subject_attendances
 * - student_attendance_bulks
 */
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { classes, enrollments, sections } from "./domain-academic";

export type AttendanceMetadata = {
  daysOpened?: number;
  daysAbsent?: number;
  daysPresent?: number;
  notes?: string;
  leaveRequestId?: number;
};

// Universal Attendance — replaces 4 parallel tables
export const attendances = sqliteTable("domain_attendance_attendances", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Participant (Student/Staff)
  actorType: text("actor_type", { enum: ["student", "staff"] }).notNull(),
  scopeType: text("scope_type", { enum: ["daily", "subject", "term_summary"] }).notNull(),
  scopeRefId: integer("scope_ref_id"),  // subject_id or exam_type_id
  attendanceDate: text("attendance_date"),
  enrollmentId: integer("enrollment_id").references(() => enrollments.id),
  classId: integer("class_id").references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  status: text("status", { enum: ["present", "absent", "late", "half_day", "excused"] }).notNull(),
  // How attendance was captured — enables anomaly detection
  sourceType: text("source_type", { enum: ["manual", "biometric", "qr", "auto_reconciled"] }).default("manual").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<AttendanceMetadata>(),
  recordedBy: integer("recorded_by").references(() => users.id), // Staff persona
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  personDateIdx: index("att_user_date_idx").on(table.userId, table.attendanceDate),
  tenantDateIdx: index("att_tenant_date_idx").on(table.tenantId, table.attendanceDate),
  tenantAcademicIdx: index("att_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

// --- NEW TABLE ---

// Holidays — replaces smHolidays, smWeekends
export const holidays = sqliteTable("domain_attendance_holidays", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: text("title", { length: 200 }).notNull(),
  description: text("description"),
  holidayType: text("holiday_type", { enum: ["holiday", "weekend", "half_day", "event"] }).notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  isRecurring: integer("is_recurring").default(0),  // for weekends
  academicId: integer("academic_id").references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantDateIdx: index("hol_tenant_date_idx").on(table.tenantId, table.fromDate),
}));
