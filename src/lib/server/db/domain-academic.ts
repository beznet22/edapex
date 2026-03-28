/**
 * ARCHITECTURE OVERVIEW: Academic Domain
 * 
 * Purpose:
 * Models the hierarchical academic structure utilizing strict composite foreign keys 
 * and tenant isolation. Manages cross-entity associations like `sm_class_sections` via 
 * enforced relational mapping and strict enum typing, preparing a robust foundational
 * schema for student enrollments, attendance, and routines.
 * 
 * Replaces Legacy Tables:
 * - sm_classes
 * - sm_sections
 * - sm_class_sections
 * - sm_subjects
 * - sm_assign_subjects
 * - sm_class_routines / sm_class_times
 */
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
  json,
} from "drizzle-orm/mysql-core";

import { users, tenants, academicYears, accounts } from "./domain-core";

// Unified Classes & Sections — replaces sm_classes, sm_sections, sm_class_sections, sm_subjects

export const classes = mysqlTable("classes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  passMark: decimal("pass_mark", { precision: 8, scale: 2 }),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("cls_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const sections = mysqlTable("sections", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("sec_tenant_idx").on(table.tenantId),
}));

export const classSections = mysqlTable("class_sections", {
  id: int("id").autoincrement().primaryKey(),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  classSectionIdx: index("clsec_class_sec_idx").on(table.classId, table.sectionId),
}));

export const subjects = mysqlTable("subjects", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 100 }),
  type: mysqlEnum("type", ["theory", "practical"]).notNull(),
  passMark: decimal("pass_mark", { precision: 8, scale: 2 }),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("sub_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const enrollments = mysqlTable("enrollments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id), // Student persona
  classId: int("class_id").references(() => classes.id),
  sectionId: int("section_id").references(() => sections.id),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  rollNo: varchar("roll_no", { length: 100 }),
  isDefault: tinyint("is_default").default(1),
  status: mysqlEnum("status", ["active", "promoted", "graduated", "withdrawn", "retained"]).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  studentAcademicIdx: index("enr_user_academic_idx").on(table.userId, table.academicId),
  tenantClassIdx: index("enr_tenant_class_idx").on(table.tenantId, table.classId),
}));

export const classRoutines = mysqlTable("class_routines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  teacherId: int("teacher_id").references(() => users.id), // Staff persona
  dayOfWeek: mysqlEnum("day_of_week", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  roomNo: varchar("room_no", { length: 100 }),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const homeworks = mysqlTable("homeworks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  homeworkDate: date("homework_date", { mode: "string" }).notNull(),
  submissionDate: date("submission_date", { mode: "string" }).notNull(),
  description: text("description"),
  attachment: varchar("attachment", { length: 500 }),
  marks: decimal("marks", { precision: 8, scale: 2 }),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lessons = mysqlTable("lessons", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const subjectAssignments = mysqlTable("subject_assignments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  staffId: int("staff_id").notNull().references(() => users.id), // Teacher persona
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  assignmentIdx: index("subj_assign_idx").on(table.classId, table.sectionId, table.subjectId),
  staffIdx: index("subj_staff_idx").on(table.staffId),
}));

// --- NEW TABLES ---

// Class Teachers — replaces smAssignClassTeachers
export const classTeachers = mysqlTable("class_teachers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  staffId: int("staff_id").notNull().references(() => users.id), // Teacher persona
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  classSectionIdx: index("ct_class_sec_idx").on(table.classId, table.sectionId, table.academicId),
  staffIdx: index("ct_staff_idx").on(table.staffId),
}));

// Homework Submissions — replaces smHomeworkStudents
export type HomeworkSubmissionMetadata = {
  evaluationDate?: string;
  teacherComments?: string;
  attachments?: string[];
};

export const homeworkSubmissions = mysqlTable("homework_submissions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  homeworkId: int("homework_id").notNull().references(() => homeworks.id, { onDelete: "cascade" }),
  userId: int("user_id").notNull().references(() => users.id), // Student persona
  enrollmentId: int("enrollment_id").references(() => enrollments.id),
  classId: int("class_id").references(() => classes.id),
  sectionId: int("section_id").references(() => sections.id),
  marks: decimal("marks", { precision: 8, scale: 2 }),
  status: mysqlEnum("status", ["pending", "submitted", "evaluated", "returned"]).notNull().default("pending"),
  metadata: json("metadata").$type<HomeworkSubmissionMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  homeworkUserIdx: index("hwsub_hw_user_idx").on(table.homeworkId, table.userId),
}));

// Promotions — replaces smStudentPromotions
export const promotions = mysqlTable("promotions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id), // Student persona
  fromClassId: int("from_class_id").notNull().references(() => classes.id),
  fromSectionId: int("from_section_id").notNull().references(() => sections.id),
  toClassId: int("to_class_id").notNull().references(() => classes.id),
  toSectionId: int("to_section_id").notNull().references(() => sections.id),
  fromAcademicId: int("from_academic_id").notNull().references(() => academicYears.id),
  toAcademicId: int("to_academic_id").notNull().references(() => academicYears.id),
  result: mysqlEnum("result", ["promoted", "retained", "graduated", "withdrawn"]).notNull(),
  promotedBy: int("promoted_by").references(() => users.id),
  notes: text("notes"),
  promotedAt: timestamp("promoted_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userAcademicIdx: index("promo_user_academic_idx").on(table.userId, table.fromAcademicId),
  tenantAcademicIdx: index("promo_tenant_academic_idx").on(table.tenantId, table.fromAcademicId),
}));

// Timelines — replaces smStudentTimelines
export const timelines = mysqlTable("timelines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 100 }).notNull(), // e.g., 'admission', 'promotion', 'exam-1'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userAcademicIdx: index("tm_user_academic_idx").on(table.userId, table.academicId),
}));
