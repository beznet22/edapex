/**
 * ARCHITECTURE OVERVIEW: Learning Management System (LMS) Domain
 * 
 * Purpose:
 * Enables scalable tracking of assignments and digital coursework, replacing convoluted 
 * relational maps with Drizzle JSON structures for adaptive lesson delivery. Enforces
 * strict foreign keys across `tenant_id`, `academic_id`, and `account_id` for isolated tracking.
 * 
 * Replaces Legacy Tables:
 * - sm_homeworks / sm_homework_students / sm_upload_homework_contents / sm_student_homeworks
 * - sm_lessons / sm_lesson_details / sm_lesson_topics / sm_lesson_topic_details / lesson_planners
 * - sm_online_classes / sm_courses / sm_course_categories
 */
import { pgSchema, text, doublePrecision, integer, serial, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { subjects } from "./domain-academic";
import { feeMasters } from "./domain-finance";

// --- LMS METADATA TYPES ---

export type LMSCourseMetadata = {
  syllabus?: string;
  prerequisites?: string[];
  instructors?: number[]; // userIds
  estimatedDuration?: string;
};

export type LMSLessonMetadata = {
  summary?: string;
  resources?: { name: string; url: string }[];
  learningObjectives?: string[];
};

export type AIGradingConfig = {
  rubric: string;
  maxMarks: number;
  aiPrompt?: string;
  gradingStyle?: "strict" | "encouraging" | "technical";
};

export type LMSAttachment = {
  name: string;
  url: string;
  type: string;
};

export type TutoringMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
};

// Brand New LMS Domain - AI-Native & Standalone-Friendly
export const lmsSchema = pgSchema("domain_lms");

export const lmsCourses = lmsSchema.table("lms_courses", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  educationLevel: varchar("education_level", { length: 150 }).notNull(),
  gradeLevel: varchar("grade_level", { length: 50 }), // e.g. 'grade_10', 'year_1'
  subjectId: integer("subject_id").references(() => subjects.id), // Optional link to SMS
  creditHours: numeric("credit_hours", { precision: 5, scale: 2 }), // For tertiary
  feeMasterId: integer("fee_master_id").references(() => feeMasters.id),
  isFree: boolean("is_free").default(true).notNull(),
  thumbnail: varchar("thumbnail", { length: 500 }),
  metadata: jsonb("metadata").$type<LMSCourseMetadata>(),
  activeStatus: integer("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("lms_crs_tenant_idx").on(table.tenantId),
  levelIdx: index("lms_crs_level_idx").on(table.educationLevel),
}));

export const lmsModules = lmsSchema.table("lms_modules", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => lmsCourses.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsLessons = lmsSchema.table("lms_lessons", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => lmsModules.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  lessonType: varchar("lesson_type", { length: 150 }).default("text"),
  mediaUrl: varchar("media_url", { length: 500 }),
  durationMinutes: integer("duration_minutes"),
  sortOrder: integer("sort_order").default(0),
  metadata: jsonb("metadata").$type<LMSLessonMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsLearningObjectives = lmsSchema.table("lms_learning_objectives", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").references(() => lmsLessons.id),
  moduleId: integer("module_id").references(() => lmsModules.id),
  objective: text("objective").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsAssignments = lmsSchema.table("lms_assignments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  lessonId: integer("lesson_id").references(() => lmsLessons.id),
  moduleId: integer("module_id").references(() => lmsModules.id),
  courseId: integer("course_id").notNull().references(() => lmsCourses.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  points: integer("points").default(100),
  aiGradingConfig: jsonb("ai_grading_config").$type<AIGradingConfig>(), // instructions for AI grader
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsSubmissions = lmsSchema.table("lms_submissions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  assignmentId: integer("assignment_id").notNull().references(() => lmsAssignments.id),
  userId: integer("user_id").notNull().references(() => users.id), // Student persona
  academicId: integer("academic_id").references(() => academicYears.id),
  content: text("content"),
  attachments: jsonb("attachments").$type<LMSAttachment[]>(),
  grade: numeric("grade", { precision: 5, scale: 2 }),
  aiFeedback: text("ai_feedback"),
  teacherFeedback: text("teacher_feedback"),
  status: varchar("status", { length: 150 }).default("submitted"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsEnrollments = lmsSchema.table("lms_enrollments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  courseId: integer("course_id").notNull().references(() => lmsCourses.id),
  userId: integer("user_id").notNull().references(() => users.id),
  academicId: integer("academic_id").references(() => academicYears.id),
  enrollmentDate: timestamp("enrollment_date").defaultNow(),
  status: varchar("status", { length: 150 }).default("active"),
  progressPercent: integer("progress_percent").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userCourseIdx: index("lms_enr_user_crs_idx").on(table.userId, table.courseId),
}));

export const lmsProgress = lmsSchema.table("lms_progress", {
  id: serial("id").primaryKey(),
  enrollmentId: integer("enrollment_id").notNull().references(() => lmsEnrollments.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lmsLessons.id),
  status: varchar("status", { length: 150 }).default("not_started"),
  timeSpentSeconds: integer("time_spent_seconds").default(0),
  lastAccessedAt: timestamp("last_accessed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsCompetencies = lmsSchema.table("lms_competencies", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  educationLevel: varchar("education_level", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsCompetencyRecords = lmsSchema.table("lms_competency_records", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Participant persona
  academicId: integer("academic_id").references(() => academicYears.id),
  competencyId: integer("competency_id").notNull().references(() => lmsCompetencies.id),
  attainmentLevel: varchar("attainment_level", { length: 150 }).notNull(),
  evidence: jsonb("evidence").$type<{ type: string; id: number | string; url?: string }[]>(), // links to submissions or assessment results
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsTutoringSessions = lmsSchema.table("lms_tutoring_sessions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  academicId: integer("academic_id").references(() => academicYears.id),
  lessonId: integer("lesson_id").references(() => lmsLessons.id),
  topic: varchar("topic", { length: 500 }),
  messages: jsonb("messages").$type<TutoringMessage[]>(), // Full chat history for this tutoring interaction
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsLearningPaths = lmsSchema.table("lms_learning_paths", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  academicId: integer("academic_id").references(() => academicYears.id),
  goalDescription: text("goal_description"),
  status: varchar("status", { length: 150 }).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsLearningPathSteps = lmsSchema.table("lms_learning_path_steps", {
  id: serial("id").primaryKey(),
  pathId: integer("path_id").notNull().references(() => lmsLearningPaths.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lmsLessons.id),
  sortOrder: integer("sort_order").notNull(),
  status: varchar("status", { length: 150 }).default("locked"),
  prerequisites: jsonb("prerequisites").$type<number[]>(), // IDs of other steps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lmsAnalyticsEvents = lmsSchema.table("lms_analytics_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Participant persona
  eventType: varchar("event_type", { length: 100 }).notNull(), // 'page_view', 'video_pause', 'quiz_submit'
  eventData: jsonb("event_data").$type<Record<string, any>>(),
  contextUrl: varchar("context_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantTimeIdx: index("lms_ana_tenant_time_idx").on(table.tenantId, table.createdAt),
}));
