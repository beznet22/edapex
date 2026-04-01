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
import { generateId } from "../utils/id";

import { users, tenants, academicYears, accounts } from "./domain-core";

// Unified Classes & Sections — replaces sm_classes, sm_sections, sm_class_sections, sm_subjects

export const classes = mysqlTable("classes", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  passMark: decimal("pass_mark", { precision: 8, scale: 2 }),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("cls_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const sections = mysqlTable("sections", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("sec_tenant_idx").on(table.tenantId),
}));

export const classSections = mysqlTable("class_sections", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  classId: varchar("class_id", { length: 36 }).notNull().references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).notNull().references(() => sections.id),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  classSectionIdx: index("clsec_class_sec_idx").on(table.classId, table.sectionId),
}));

export const subjects = mysqlTable("subjects", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 100 }),
  type: mysqlEnum("type", ["theory", "practical"]).notNull(),
  passMark: decimal("pass_mark", { precision: 8, scale: 2 }),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("sub_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const enrollments = mysqlTable("enrollments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Student persona
  classId: varchar("class_id", { length: 36 }).references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).references(() => sections.id),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
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
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  classId: varchar("class_id", { length: 36 }).notNull().references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).notNull().references(() => sections.id),
  subjectId: varchar("subject_id", { length: 36 }).notNull().references(() => subjects.id),
  teacherId: varchar("teacher_id", { length: 36 }).references(() => users.id), // Staff persona
  dayOfWeek: mysqlEnum("day_of_week", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  roomNo: varchar("room_no", { length: 100 }),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("cr_tenant_academic_idx").on(table.tenantId, table.academicId),
  classScheduleIdx: index("cr_class_schedule_idx").on(table.classId, table.sectionId, table.dayOfWeek),
}));

export const homeworks = mysqlTable("homeworks", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  classId: varchar("class_id", { length: 36 }).notNull().references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).notNull().references(() => sections.id),
  subjectId: varchar("subject_id", { length: 36 }).notNull().references(() => subjects.id),
  homeworkDate: date("homework_date", { mode: "string" }).notNull(),
  submissionDate: date("submission_date", { mode: "string" }).notNull(),
  description: text("description"),
  attachment: varchar("attachment", { length: 500 }),
  marks: decimal("marks", { precision: 8, scale: 2 }),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("hw_tenant_academic_idx").on(table.tenantId, table.academicId),
  classSubjectIdx: index("hw_class_subject_idx").on(table.classId, table.subjectId),
}));

export const lessons = mysqlTable("lessons", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  classId: varchar("class_id", { length: 36 }).notNull().references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).notNull().references(() => sections.id),
  subjectId: varchar("subject_id", { length: 36 }).notNull().references(() => subjects.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const subjectAssignments = mysqlTable("subject_assignments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  staffId: varchar("staff_id", { length: 36 }).notNull().references(() => users.id), // Teacher persona
  classId: varchar("class_id", { length: 36 }).notNull().references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).notNull().references(() => sections.id),
  subjectId: varchar("subject_id", { length: 36 }).notNull().references(() => subjects.id),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  assignmentIdx: index("subj_assign_idx").on(table.classId, table.sectionId, table.subjectId),
  staffIdx: index("subj_staff_idx").on(table.staffId),
}));

// --- NEW TABLES ---

// Class Teachers — replaces smAssignClassTeachers
export const classTeachers = mysqlTable("class_teachers", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  classId: varchar("class_id", { length: 36 }).notNull().references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).notNull().references(() => sections.id),
  staffId: varchar("staff_id", { length: 36 }).notNull().references(() => users.id), // Teacher persona
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
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
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  homeworkId: varchar("homework_id", { length: 36 }).notNull().references(() => homeworks.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Student persona
  enrollmentId: varchar("enrollment_id", { length: 36 }).references(() => enrollments.id),
  classId: varchar("class_id", { length: 36 }).references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).references(() => sections.id),
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
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Student persona
  fromClassId: varchar("from_class_id", { length: 36 }).notNull().references(() => classes.id),
  fromSectionId: varchar("from_section_id", { length: 36 }).notNull().references(() => sections.id),
  toClassId: varchar("to_class_id", { length: 36 }).notNull().references(() => classes.id),
  toSectionId: varchar("to_section_id", { length: 36 }).notNull().references(() => sections.id),
  fromAcademicId: varchar("from_academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  toAcademicId: varchar("to_academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  result: mysqlEnum("result", ["promoted", "retained", "graduated", "withdrawn"]).notNull(),
  promotedBy: varchar("promoted_by", { length: 36 }).references(() => users.id),
  notes: text("notes"),
  promotedAt: timestamp("promoted_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userAcademicIdx: index("promo_user_academic_idx").on(table.userId, table.fromAcademicId),
  tenantAcademicIdx: index("promo_tenant_academic_idx").on(table.tenantId, table.fromAcademicId),
}));

// Timelines — replaces smStudentTimelines
export const timelines = mysqlTable("timelines", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  type: varchar("type", { length: 100 }).notNull(), // e.g., 'admission', 'promotion', 'exam-1'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userAcademicIdx: index("tm_user_academic_idx").on(table.userId, table.academicId),
}));
