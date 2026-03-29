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
import { pgSchema, text, doublePrecision, integer, serial, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";

import { users, tenants, academicYears, accounts } from "./domain-core";

// Unified Classes & Sections — replaces sm_classes, sm_sections, sm_class_sections, sm_subjects
export const academicSchema = pgSchema("domain_academic");


export const classes = academicSchema.table("classes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  passMark: numeric("pass_mark", { precision: 8, scale: 2 }),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  activeStatus: smallint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("cls_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const sections = academicSchema.table("sections", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  activeStatus: smallint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("sec_tenant_idx").on(table.tenantId),
}));

export const classSections = academicSchema.table("class_sections", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  classSectionIdx: index("clsec_class_sec_idx").on(table.classId, table.sectionId),
}));

export const subjects = academicSchema.table("subjects", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 100 }),
  type: varchar("type", { length: 150 }).notNull(),
  passMark: numeric("pass_mark", { precision: 8, scale: 2 }),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  activeStatus: smallint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("sub_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const enrollments = academicSchema.table("enrollments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Student persona
  classId: integer("class_id").references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  rollNo: varchar("roll_no", { length: 100 }),
  isDefault: smallint("is_default").default(1),
  status: varchar("status", { length: 150 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  studentAcademicIdx: index("enr_user_academic_idx").on(table.userId, table.academicId),
  tenantClassIdx: index("enr_tenant_class_idx").on(table.tenantId, table.classId),
}));

export const classRoutines = academicSchema.table("class_routines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  teacherId: integer("teacher_id").references(() => users.id), // Staff persona
  dayOfWeek: varchar("day_of_week", { length: 150 }).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  roomNo: varchar("room_no", { length: 100 }),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("cr_tenant_academic_idx").on(table.tenantId, table.academicId),
  classScheduleIdx: index("cr_class_schedule_idx").on(table.classId, table.sectionId, table.dayOfWeek),
}));

export const homeworks = academicSchema.table("homeworks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  homeworkDate: date("homework_date", { mode: "string" }).notNull(),
  submissionDate: date("submission_date", { mode: "string" }).notNull(),
  description: text("description"),
  attachment: varchar("attachment", { length: 500 }),
  marks: numeric("marks", { precision: 8, scale: 2 }),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("hw_tenant_academic_idx").on(table.tenantId, table.academicId),
  classSubjectIdx: index("hw_class_subject_idx").on(table.classId, table.subjectId),
}));

export const lessons = academicSchema.table("lessons", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const subjectAssignments = academicSchema.table("subject_assignments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  staffId: integer("staff_id").notNull().references(() => users.id), // Teacher persona
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assignmentIdx: index("subj_assign_idx").on(table.classId, table.sectionId, table.subjectId),
  staffIdx: index("subj_staff_idx").on(table.staffId),
}));

// --- NEW TABLES ---

// Class Teachers — replaces smAssignClassTeachers
export const classTeachers = academicSchema.table("class_teachers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  staffId: integer("staff_id").notNull().references(() => users.id), // Teacher persona
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const homeworkSubmissions = academicSchema.table("homework_submissions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  homeworkId: integer("homework_id").notNull().references(() => homeworks.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id), // Student persona
  enrollmentId: integer("enrollment_id").references(() => enrollments.id),
  classId: integer("class_id").references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  marks: numeric("marks", { precision: 8, scale: 2 }),
  status: varchar("status", { length: 150 }).notNull().default("pending"),
  metadata: jsonb("metadata").$type<HomeworkSubmissionMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  homeworkUserIdx: index("hwsub_hw_user_idx").on(table.homeworkId, table.userId),
}));

// Promotions — replaces smStudentPromotions
export const promotions = academicSchema.table("promotions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Student persona
  fromClassId: integer("from_class_id").notNull().references(() => classes.id),
  fromSectionId: integer("from_section_id").notNull().references(() => sections.id),
  toClassId: integer("to_class_id").notNull().references(() => classes.id),
  toSectionId: integer("to_section_id").notNull().references(() => sections.id),
  fromAcademicId: integer("from_academic_id").notNull().references(() => academicYears.id),
  toAcademicId: integer("to_academic_id").notNull().references(() => academicYears.id),
  result: varchar("result", { length: 150 }).notNull(),
  promotedBy: integer("promoted_by").references(() => users.id),
  notes: text("notes"),
  promotedAt: timestamp("promoted_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userAcademicIdx: index("promo_user_academic_idx").on(table.userId, table.fromAcademicId),
  tenantAcademicIdx: index("promo_tenant_academic_idx").on(table.tenantId, table.fromAcademicId),
}));

// Timelines — replaces smStudentTimelines
export const timelines = academicSchema.table("timelines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 100 }).notNull(), // e.g., 'admission', 'promotion', 'exam-1'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userAcademicIdx: index("tm_user_academic_idx").on(table.userId, table.academicId),
}));
