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
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { generateId } from "../utils/id";

import { users, tenants, academicYears, accounts } from "./domain-core";

// --- STRUCTURAL METADATA TYPES ---
export type AcademicStructuralMetadata = {
  isCompulsory?: boolean; // Protects free tracks (UBE, K-8 public) from auxiliary billing
  trackFamily?: string;   // Anchors specialization jumping (e.g., 'ib_science', 'sss_humanities')
  customTags?: string[];  // Dynamic AI Skill context
  [key: string]: unknown;
};

// Unified Classes & Sections — replaces sm_classes, sm_sections, sm_class_sections, sm_subjects

export const classes = sqliteTable("domain_academic_classes", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 200 }).notNull(),
  passMark: real("pass_mark"),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  metadata: text("metadata", { mode: "json" }).$type<AcademicStructuralMetadata>(),
  activeStatus: integer("active_status").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("cls_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const sections = sqliteTable("domain_academic_sections", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 200 }).notNull(),
  metadata: text("metadata", { mode: "json" }).$type<AcademicStructuralMetadata>(),
  activeStatus: integer("active_status").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("sec_tenant_idx").on(table.tenantId),
}));

export const classSections = sqliteTable("domain_academic_class_sections", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  classId: text("class_id").notNull().references(() => classes.id),
  sectionId: text("section_id").notNull().references(() => sections.id),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  classSectionIdx: index("clsec_class_sec_idx").on(table.classId, table.sectionId),
}));

export const subjects = sqliteTable("domain_academic_subjects", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 255 }).notNull(),
  code: text("code", { length: 100 }),
  type: text("type", { enum: ["theory", "practical", "vocational", "hybrid"] }).notNull(),
  passMark: real("pass_mark"),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  metadata: text("metadata", { mode: "json" }).$type<AcademicStructuralMetadata>(),
  activeStatus: integer("active_status").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("sub_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const enrollments = sqliteTable("domain_academic_enrollments", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").notNull().references(() => users.id), // Student persona
  classId: text("class_id").references(() => classes.id),
  sectionId: text("section_id").references(() => sections.id),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  rollNo: text("roll_no", { length: 100 }),
  isDefault: integer("is_default").default(1),
  status: text("status", { enum: ["active", "promoted", "graduated", "withdrawn", "retained"] }).notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  studentAcademicIdx: index("enr_user_academic_idx").on(table.userId, table.academicId),
  tenantClassIdx: index("enr_tenant_class_idx").on(table.tenantId, table.classId),
}));

export const classRoutines = sqliteTable("domain_academic_class_routines", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  classId: text("class_id").notNull().references(() => classes.id),
  sectionId: text("section_id").notNull().references(() => sections.id),
  subjectId: text("subject_id").notNull().references(() => subjects.id),
  teacherId: text("teacher_id").references(() => users.id), // Staff persona
  dayOfWeek: text("day_of_week", { enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] }).notNull(),
  startTime: text("start_time", { length: 20 }),
  endTime: text("end_time", { length: 20 }),
  roomNo: text("room_no", { length: 100 }),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("cr_tenant_academic_idx").on(table.tenantId, table.academicId),
  classScheduleIdx: index("cr_class_schedule_idx").on(table.classId, table.sectionId, table.dayOfWeek),
}));

export const homeworks = sqliteTable("domain_academic_homeworks", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  classId: text("class_id").notNull().references(() => classes.id),
  sectionId: text("section_id").notNull().references(() => sections.id),
  subjectId: text("subject_id").notNull().references(() => subjects.id),
  homeworkDate: text("homework_date").notNull(),
  submissionDate: text("submission_date").notNull(),
  description: text("description"),
  attachment: text("attachment", { length: 500 }),
  marks: real("marks"),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("hw_tenant_academic_idx").on(table.tenantId, table.academicId),
  classSubjectIdx: index("hw_class_subject_idx").on(table.classId, table.subjectId),
}));

export const lessons = sqliteTable("domain_academic_lessons", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  classId: text("class_id").notNull().references(() => classes.id),
  sectionId: text("section_id").notNull().references(() => sections.id),
  subjectId: text("subject_id").notNull().references(() => subjects.id),
  title: text("title", { length: 255 }).notNull(),
  description: text("description"),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const subjectAssignments = sqliteTable("domain_academic_subject_assignments", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  staffId: text("staff_id").notNull().references(() => users.id), // Teacher persona
  classId: text("class_id").notNull().references(() => classes.id),
  sectionId: text("section_id").notNull().references(() => sections.id),
  subjectId: text("subject_id").notNull().references(() => subjects.id),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  assignmentIdx: index("subj_assign_idx").on(table.classId, table.sectionId, table.subjectId),
  staffIdx: index("subj_staff_idx").on(table.staffId),
}));

// --- NEW TABLES ---

// Class Teachers — replaces smAssignClassTeachers
export const classTeachers = sqliteTable("domain_academic_class_teachers", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  classId: text("class_id").notNull().references(() => classes.id),
  sectionId: text("section_id").notNull().references(() => sections.id),
  staffId: text("staff_id").notNull().references(() => users.id), // Teacher persona
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
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

export const homeworkSubmissions = sqliteTable("domain_academic_homework_submissions", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  homeworkId: text("homework_id").notNull().references(() => homeworks.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id), // Student persona
  enrollmentId: text("enrollment_id").references(() => enrollments.id),
  classId: text("class_id").references(() => classes.id),
  sectionId: text("section_id").references(() => sections.id),
  marks: real("marks"),
  status: text("status", { enum: ["pending", "submitted", "evaluated", "returned"] }).notNull().default("pending"),
  metadata: text("metadata", { mode: "json" }).$type<HomeworkSubmissionMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  homeworkUserIdx: index("hwsub_hw_user_idx").on(table.homeworkId, table.userId),
}));

// Promotions — replaces smStudentPromotions
export const promotions = sqliteTable("domain_academic_promotions", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").notNull().references(() => users.id), // Student persona
  fromClassId: text("from_class_id").notNull().references(() => classes.id),
  fromSectionId: text("from_section_id").notNull().references(() => sections.id),
  toClassId: text("to_class_id").notNull().references(() => classes.id),
  toSectionId: text("to_section_id").notNull().references(() => sections.id),
  fromAcademicId: text("from_academic_id").notNull().references(() => academicYears.id),
  toAcademicId: text("to_academic_id").notNull().references(() => academicYears.id),
  result: text("result", { enum: ["promoted", "retained", "graduated", "withdrawn"] }).notNull(),
  promotedBy: text("promoted_by").references(() => users.id),
  notes: text("notes"),
  promotedAt: integer("promoted_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userAcademicIdx: index("promo_user_academic_idx").on(table.userId, table.fromAcademicId),
  tenantAcademicIdx: index("promo_tenant_academic_idx").on(table.tenantId, table.fromAcademicId),
}));

// Timelines — replaces smStudentTimelines
export const timelines = sqliteTable("domain_academic_timelines", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type", { length: 100 }).notNull(), // e.g., 'admission', 'promotion', 'exam-1'
  title: text("title", { length: 255 }).notNull(),
  description: text("description"),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userAcademicIdx: index("tm_user_academic_idx").on(table.userId, table.academicId),
}));
