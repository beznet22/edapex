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
import { generateId } from "../utils/id";

export type AttendanceMetadata = {
  daysPresent?: number;
  notes?: string;
  leaveRequestId?: string;
};

// Universal Attendance — replaces 4 parallel tables
export const attendances = mysqlTable("attendances", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Participant (Student/Staff)
  actorType: mysqlEnum("actor_type", ["student", "staff"]).notNull(),
  scopeType: mysqlEnum("scope_type", ["daily", "subject", "term_summary"]).notNull(),
  scopeRefId: varchar("scope_ref_id", { length: 36 }),  // subject_id or exam_type_id
  attendanceDate: date("attendance_date", { mode: "string" }),
  enrollmentId: varchar("enrollment_id", { length: 36 }).references(() => enrollments.id),
  classId: varchar("class_id", { length: 36 }).references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).references(() => sections.id),
  status: mysqlEnum("status", ["present", "absent", "late", "half_day", "excused"]).notNull(),
  // How attendance was captured — enables anomaly detection
  sourceType: mysqlEnum("source_type", ["manual", "biometric", "qr", "auto_reconciled"]).default("manual").notNull(),
  metadata: json("metadata").$type<AttendanceMetadata>(),
  recordedBy: varchar("recorded_by", { length: 36 }).references(() => users.id), // Staff persona
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
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
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  holidayType: mysqlEnum("holiday_type", ["holiday", "weekend", "half_day", "event"]).notNull(),
  fromDate: date("from_date", { mode: "string" }).notNull(),
  toDate: date("to_date", { mode: "string" }).notNull(),
  isRecurring: tinyint("is_recurring").default(0),  // for weekends
  academicId: varchar("academic_id", { length: 36 }).references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantDateIdx: index("hol_tenant_date_idx").on(table.tenantId, table.fromDate),
}));
