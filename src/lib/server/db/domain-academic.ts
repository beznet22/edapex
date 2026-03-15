import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  tinyint,
  decimal,
  index,
  mysqlEnum,
  text,
  date,
} from "drizzle-orm/mysql-core";

import { accounts } from "./domain-core";

// Unified Classes & Sections — replaces sm_classes, sm_sections, sm_class_sections, sm_subjects

export const classes = mysqlTable("edx_classes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  passMark: decimal("pass_mark", { precision: 8, scale: 2 }),
  academicId: int("academic_id").notNull(),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("cls_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const sections = mysqlTable("edx_sections", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("sec_tenant_idx").on(table.tenantId),
}));

export const classSections = mysqlTable("edx_class_sections", {
  id: int("id").autoincrement().primaryKey(),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  tenantId: int("tenant_id").notNull(),
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  classSectionIdx: index("clsec_class_sec_idx").on(table.classId, table.sectionId),
}));

export const subjects = mysqlTable("edx_subjects", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 100 }),
  type: mysqlEnum("type", ["theory", "practical"]).notNull(),
  passMark: decimal("pass_mark", { precision: 8, scale: 2 }),
  academicId: int("academic_id").notNull(),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("sub_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const enrollments = mysqlTable("edx_enrollments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  accountId: int("account_id").notNull().references(() => accounts.id), // Student account
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  academicId: int("academic_id").notNull(),
  rollNo: varchar("roll_no", { length: 100 }),
  isDefault: tinyint("is_default").default(1),
  status: mysqlEnum("status", ["active", "promoted", "graduated", "withdrawn"]).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  studentAcademicIdx: index("enr_student_academic_idx").on(table.accountId, table.academicId),
  tenantClassIdx: index("enr_tenant_class_idx").on(table.tenantId, table.classId),
}));

export const classRoutines = mysqlTable("edx_class_routines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  teacherId: int("teacher_id").references(() => accounts.id), // Staff account
  dayOfWeek: mysqlEnum("day_of_week", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  roomNo: varchar("room_no", { length: 100 }),
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const homeworks = mysqlTable("edx_homeworks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  homeworkDate: date("homework_date", { mode: "string" }).notNull(),
  submissionDate: date("submission_date", { mode: "string" }).notNull(),
  description: text("description"),
  attachment: varchar("attachment", { length: 500 }),
  marks: decimal("marks", { precision: 8, scale: 2 }),
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lessons = mysqlTable("edx_lessons", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subjectAssignments = mysqlTable("edx_subject_assignments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  staffId: int("staff_id").notNull().references(() => accounts.id), // Teacher Account
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  assignmentIdx: index("subj_assign_idx").on(table.classId, table.sectionId, table.subjectId),
  staffIdx: index("subj_staff_idx").on(table.staffId),
}));
