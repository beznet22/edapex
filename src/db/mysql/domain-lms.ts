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
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  text,
  json,
  index,
  decimal,
  boolean
} from "drizzle-orm/mysql-core";

import { users, tenants, academicYears, accounts , academicTerms } from "./domain-core";
import { subjects } from "./domain-academic";
import { feeMasters } from "./domain-finance";
import { generateId } from "../utils/id";

// --- LMS METADATA TYPES ---

export type LMSCourseMetadata = {
  syllabus?: string;
  prerequisites?: string[];
  instructors?: string[]; // userIds
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
export const lmsCourses = mysqlTable("lms_courses", {
  termId: text("term_id").references(() => academicTerms.id),

  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  educationLevel: mysqlEnum("education_level", ["k1_k12", "tertiary", "professional", "hobby"]).notNull(),
  gradeLevel: varchar("grade_level", { length: 50 }), // e.g. 'grade_10', 'year_1'
  subjectId: varchar("subject_id", { length: 36 }).references(() => subjects.id), // Optional link to SMS
  creditHours: decimal("credit_hours", { precision: 5, scale: 2 }), // For tertiary
  feeMasterId: varchar("fee_master_id", { length: 36 }).references(() => feeMasters.id),
  isFree: boolean("is_free").default(true).notNull(),
  thumbnail: varchar("thumbnail", { length: 500 }),
  metadata: json("metadata").$type<LMSCourseMetadata>(),
  activeStatus: int("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("lms_crs_tenant_idx").on(table.tenantId),
  levelIdx: index("lms_crs_level_idx").on(table.educationLevel),
}));

export const lmsModules = mysqlTable("lms_modules", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  courseId: varchar("course_id", { length: 36 }).notNull().references(() => lmsCourses.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  sortOrder: int("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantCourseIdx: index("lms_mod_tenant_crs_idx").on(table.tenantId, table.courseId),
}));

export const lmsLessons = mysqlTable("lms_lessons", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  moduleId: varchar("module_id", { length: 36 }).notNull().references(() => lmsModules.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  lessonType: mysqlEnum("lesson_type", ["video", "text", "quiz", "interactive", "ai_tutoring"]).default("text"),
  mediaUrl: varchar("media_url", { length: 500 }),
  durationMinutes: int("duration_minutes"),
  sortOrder: int("sort_order").default(0),
  metadata: json("metadata").$type<LMSLessonMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantModuleIdx: index("lms_les_tenant_mod_idx").on(table.tenantId, table.moduleId),
}));

export const lmsLearningObjectives = mysqlTable("lms_learning_objectives", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  lessonId: varchar("lesson_id", { length: 36 }).references(() => lmsLessons.id),
  moduleId: varchar("module_id", { length: 36 }).references(() => lmsModules.id),
  objective: text("objective").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lmsAssignments = mysqlTable("lms_assignments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  lessonId: varchar("lesson_id", { length: 36 }).references(() => lmsLessons.id),
  moduleId: varchar("module_id", { length: 36 }).references(() => lmsModules.id),
  courseId: varchar("course_id", { length: 36 }).notNull().references(() => lmsCourses.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  points: int("points").default(100),
  aiGradingConfig: json("ai_grading_config").$type<AIGradingConfig>(), // instructions for AI grader
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lmsSubmissions = mysqlTable("lms_submissions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  assignmentId: varchar("assignment_id", { length: 36 }).notNull().references(() => lmsAssignments.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Student persona
  academicId: varchar("academic_id", { length: 36 }).references(() => academicYears.id),
  content: text("content"),
  attachments: json("attachments").$type<LMSAttachment[]>(),
  grade: decimal("grade", { precision: 5, scale: 2 }),
  aiFeedback: text("ai_feedback"),
  teacherFeedback: text("teacher_feedback"),
  status: mysqlEnum("status", ["pending", "submitted", "graded", "resubmit"]).default("submitted"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lmsEnrollments = mysqlTable("lms_enrollments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  courseId: varchar("course_id", { length: 36 }).notNull().references(() => lmsCourses.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  academicId: varchar("academic_id", { length: 36 }).references(() => academicYears.id),
  enrollmentDate: timestamp("enrollment_date").defaultNow(),
  status: mysqlEnum("status", ["active", "completed", "suspended", "expired"]).default("active"),
  progressPercent: int("progress_percent").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userCourseIdx: index("lms_enr_user_crs_idx").on(table.userId, table.courseId),
}));

export const lmsProgress = mysqlTable("lms_progress", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  enrollmentId: varchar("enrollment_id", { length: 36 }).notNull().references(() => lmsEnrollments.id, { onDelete: "cascade" }),
  lessonId: varchar("lesson_id", { length: 36 }).notNull().references(() => lmsLessons.id),
  status: mysqlEnum("status", ["not_started", "started", "completed"]).default("not_started"),
  timeSpentSeconds: int("time_spent_seconds").default(0),
  lastAccessedAt: timestamp("last_accessed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lmsCompetencies = mysqlTable("lms_competencies", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  educationLevel: varchar("education_level", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lmsCompetencyRecords = mysqlTable("lms_competency_records", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Participant persona
  academicId: varchar("academic_id", { length: 36 }).references(() => academicYears.id),
  competencyId: varchar("competency_id", { length: 36 }).notNull().references(() => lmsCompetencies.id),
  attainmentLevel: mysqlEnum("attainment_level", ["learning", "proficient", "mastery"]).notNull(),
  evidence: json("evidence").$type<{ type: string; id: string; url?: string }[]>(), // links to submissions or assessment results
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lmsTutoringSessions = mysqlTable("lms_tutoring_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  academicId: varchar("academic_id", { length: 36 }).references(() => academicYears.id),
  lessonId: varchar("lesson_id", { length: 36 }).references(() => lmsLessons.id),
  topic: varchar("topic", { length: 500 }),
  messages: json("messages").$type<TutoringMessage[]>(), // Full chat history for this tutoring interaction
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lmsLearningPaths = mysqlTable("lms_learning_paths", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  academicId: varchar("academic_id", { length: 36 }).references(() => academicYears.id),
  goalDescription: text("goal_description"),
  status: mysqlEnum("status", ["active", "completed", "cancelled"]).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lmsLearningPathSteps = mysqlTable("lms_learning_path_steps", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  pathId: varchar("path_id", { length: 36 }).notNull().references(() => lmsLearningPaths.id, { onDelete: "cascade" }),
  lessonId: varchar("lesson_id", { length: 36 }).notNull().references(() => lmsLessons.id),
  sortOrder: int("sort_order").notNull(),
  status: mysqlEnum("status", ["locked", "available", "completed"]).default("locked"),
  prerequisites: json("prerequisites").$type<string[]>(), // IDs of other steps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lmsAnalyticsEvents = mysqlTable("lms_analytics_events", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Participant persona
  eventType: varchar("event_type", { length: 100 }).notNull(), // 'page_view', 'video_pause', 'quiz_submit'
  eventData: json("event_data").$type<Record<string, any>>(),
  contextUrl: varchar("context_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantTimeIdx: index("lms_ana_tenant_time_idx").on(table.tenantId, table.createdAt),
}));
