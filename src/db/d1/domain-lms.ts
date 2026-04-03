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
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants, academicYears, accounts , academicTerms } from "./domain-core";
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
export const lmsCourses = sqliteTable("lms_courses", {
  termId: text("term_id").references(() => academicTerms.id),

  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: text("title", { length: 500 }).notNull(),
  description: text("description"),
  educationLevel: text("education_level", { enum: ["k1_k12", "tertiary", "professional", "hobby"] }).notNull(),
  gradeLevel: text("grade_level", { length: 50 }), // e.g. 'grade_10', 'year_1'
  subjectId: integer("subject_id").references(() => subjects.id), // Optional link to SMS
  creditHours: real("credit_hours"), // For tertiary
  feeMasterId: integer("fee_master_id").references(() => feeMasters.id),
  isFree: integer("is_free", { mode: "boolean" }).default(true).notNull(),
  thumbnail: text("thumbnail", { length: 500 }),
  metadata: text("metadata", { mode: "json" }).$type<LMSCourseMetadata>(),
  activeStatus: integer("active_status").default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("lms_crs_tenant_idx").on(table.tenantId),
  levelIdx: index("lms_crs_level_idx").on(table.educationLevel),
}));

export const lmsModules = sqliteTable("lms_modules", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  courseId: integer("course_id").notNull().references(() => lmsCourses.id, { onDelete: "cascade" }),
  title: text("title", { length: 500 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsLessons = sqliteTable("lms_lessons", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  moduleId: integer("module_id").notNull().references(() => lmsModules.id, { onDelete: "cascade" }),
  title: text("title", { length: 500 }).notNull(),
  content: text("content"),
  lessonType: text("lesson_type", { enum: ["video", "text", "quiz", "interactive", "ai_tutoring"] }).default("text"),
  mediaUrl: text("media_url", { length: 500 }),
  durationMinutes: integer("duration_minutes"),
  sortOrder: integer("sort_order").default(0),
  metadata: text("metadata", { mode: "json" }).$type<LMSLessonMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsLearningObjectives = sqliteTable("lms_learning_objectives", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  lessonId: integer("lesson_id").references(() => lmsLessons.id),
  moduleId: integer("module_id").references(() => lmsModules.id),
  objective: text("objective").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsAssignments = sqliteTable("lms_assignments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  lessonId: integer("lesson_id").references(() => lmsLessons.id),
  moduleId: integer("module_id").references(() => lmsModules.id),
  courseId: integer("course_id").notNull().references(() => lmsCourses.id),
  title: text("title", { length: 500 }).notNull(),
  description: text("description"),
  points: integer("points").default(100),
  aiGradingConfig: text("ai_grading_config", { mode: "json" }).$type<AIGradingConfig>(), // instructions for AI grader
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsSubmissions = sqliteTable("lms_submissions", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  assignmentId: integer("assignment_id").notNull().references(() => lmsAssignments.id),
  userId: integer("user_id").notNull().references(() => users.id), // Student persona
  academicId: integer("academic_id").references(() => academicYears.id),
  content: text("content"),
  attachments: text("attachments", { mode: "json" }).$type<LMSAttachment[]>(),
  grade: real("grade"),
  aiFeedback: text("ai_feedback"),
  teacherFeedback: text("teacher_feedback"),
  status: text("status", { enum: ["pending", "submitted", "graded", "resubmit"] }).default("submitted"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsEnrollments = sqliteTable("lms_enrollments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  courseId: integer("course_id").notNull().references(() => lmsCourses.id),
  userId: integer("user_id").notNull().references(() => users.id),
  academicId: integer("academic_id").references(() => academicYears.id),
  enrollmentDate: integer("enrollment_date", { mode: "timestamp" }).defaultNow(),
  status: text("status", { enum: ["active", "completed", "suspended", "expired"] }).default("active"),
  progressPercent: integer("progress_percent").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userCourseIdx: index("lms_enr_user_crs_idx").on(table.userId, table.courseId),
}));

export const lmsProgress = sqliteTable("lms_progress", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  enrollmentId: integer("enrollment_id").notNull().references(() => lmsEnrollments.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lmsLessons.id),
  status: text("status", { enum: ["not_started", "started", "completed"] }).default("not_started"),
  timeSpentSeconds: integer("time_spent_seconds").default(0),
  lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsCompetencies = sqliteTable("lms_competencies", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: text("title", { length: 500 }).notNull(),
  description: text("description"),
  educationLevel: text("education_level", { length: 50 }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsCompetencyRecords = sqliteTable("lms_competency_records", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Participant persona
  academicId: integer("academic_id").references(() => academicYears.id),
  competencyId: integer("competency_id").notNull().references(() => lmsCompetencies.id),
  attainmentLevel: text("attainment_level", { enum: ["learning", "proficient", "mastery"] }).notNull(),
  evidence: text("evidence", { mode: "json" }).$type<{ type: string; id: number | string; url?: string }[]>(), // links to submissions or assessment results
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsTutoringSessions = sqliteTable("lms_tutoring_sessions", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  academicId: integer("academic_id").references(() => academicYears.id),
  lessonId: integer("lesson_id").references(() => lmsLessons.id),
  topic: text("topic", { length: 500 }),
  messages: text("messages", { mode: "json" }).$type<TutoringMessage[]>(), // Full chat history for this tutoring interaction
  summary: text("summary"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsLearningPaths = sqliteTable("lms_learning_paths", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  academicId: integer("academic_id").references(() => academicYears.id),
  goalDescription: text("goal_description"),
  status: text("status", { enum: ["active", "completed", "cancelled"] }).default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsLearningPathSteps = sqliteTable("lms_learning_path_steps", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  pathId: integer("path_id").notNull().references(() => lmsLearningPaths.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lmsLessons.id),
  sortOrder: integer("sort_order").notNull(),
  status: text("status", { enum: ["locked", "available", "completed"] }).default("locked"),
  prerequisites: text("prerequisites", { mode: "json" }).$type<number[]>(), // IDs of other steps
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const lmsAnalyticsEvents = sqliteTable("lms_analytics_events", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Participant persona
  eventType: text("event_type", { length: 100 }).notNull(), // 'page_view', 'video_pause', 'quiz_submit'
  eventData: text("event_data", { mode: "json" }).$type<Record<string, any>>(),
  contextUrl: text("context_url", { length: 500 }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantTimeIdx: index("lms_ana_tenant_time_idx").on(table.tenantId, table.createdAt),
}));
