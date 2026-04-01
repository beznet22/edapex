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
import { pgSchema, text, doublePrecision, integer, uuid, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { classes, enrollments, sections } from "./domain-academic";

export type AttendanceMetadata = {
  daysOpened?: number;
  daysAbsent?: number;
  daysPresent?: number;
  notes?: string;
  leaveRequestId?: string;
};

// Universal Attendance — replaces 4 parallel tables
export const attendanceSchema = pgSchema("domain_attendance");

export const attendances = attendanceSchema.table("attendances", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id), // Participant (Student/Staff)
  actorType: varchar("actor_type", { length: 150 }).notNull(),
  scopeType: varchar("scope_type", { length: 150 }).notNull(),
  scopeRefId: uuid("scope_ref_id"),  // subject_id or exam_type_id
  attendanceDate: date("attendance_date", { mode: "string" }),
  enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
  classId: uuid("class_id").references(() => classes.id),
  sectionId: uuid("section_id").references(() => sections.id),
  status: varchar("status", { length: 150 }).notNull(),
  // How attendance was captured — enables anomaly detection
  sourceType: varchar("source_type", { length: 150 }).default("manual").notNull(),
  metadata: jsonb("metadata").$type<AttendanceMetadata>(),
  recordedBy: uuid("recorded_by").references(() => users.id), // Staff persona
  academicId: uuid("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  personDateIdx: index("att_user_date_idx").on(table.userId, table.attendanceDate),
  tenantDateIdx: index("att_tenant_date_idx").on(table.tenantId, table.attendanceDate),
  tenantAcademicIdx: index("att_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

// --- NEW TABLE ---

// Holidays — replaces smHolidays, smWeekends
export const holidays = attendanceSchema.table("holidays", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  holidayType: varchar("holiday_type", { length: 150 }).notNull(),
  fromDate: date("from_date", { mode: "string" }).notNull(),
  toBe: date("to_date", { mode: "string" }).notNull(),
  isRecurring: smallint("is_recurring").default(0),  // for weekends
  academicId: uuid("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantDateIdx: index("hol_tenant_date_idx").on(table.tenantId, table.fromDate),
}));
