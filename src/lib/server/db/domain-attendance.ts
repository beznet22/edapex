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
import {

  mysqlTable,
  int,
  timestamp,
  mysqlEnum,
  date,
  json,
  index,
  varchar,
  text,
  tinyint,
} from "drizzle-orm/mysql-core";

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
export const attendances = mysqlTable("attendances", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id), // Participant (Student/Staff)
  actorType: mysqlEnum("actor_type", ["student", "staff"]).notNull(),
  scopeType: mysqlEnum("scope_type", ["daily", "subject", "term_summary"]).notNull(),
  scopeRefId: int("scope_ref_id"),  // subject_id or exam_type_id
  attendanceDate: date("attendance_date", { mode: "string" }),
  enrollmentId: int("enrollment_id").references(() => enrollments.id),
  classId: int("class_id").references(() => classes.id),
  sectionId: int("section_id").references(() => sections.id),
  status: mysqlEnum("status", ["present", "absent", "late", "half_day", "excused"]).notNull(),
  metadata: json("metadata").$type<AttendanceMetadata>(),
  recordedBy: int("recorded_by").references(() => users.id), // Staff persona
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  personDateIdx: index("att_user_date_idx").on(table.userId, table.attendanceDate),
  tenantDateIdx: index("att_tenant_date_idx").on(table.tenantId, table.attendanceDate),
  tenantAcademicIdx: index("att_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

// --- NEW TABLE ---

// Holidays — replaces smHolidays, smWeekends
export const holidays = mysqlTable("holidays", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  holidayType: mysqlEnum("holiday_type", ["holiday", "weekend", "half_day", "event"]).notNull(),
  fromDate: date("from_date", { mode: "string" }).notNull(),
  toDate: date("to_date", { mode: "string" }).notNull(),
  isRecurring: tinyint("is_recurring").default(0),  // for weekends
  academicId: int("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantDateIdx: index("hol_tenant_date_idx").on(table.tenantId, table.fromDate),
}));
