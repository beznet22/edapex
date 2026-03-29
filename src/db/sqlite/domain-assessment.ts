/**
 * ARCHITECTURE OVERVIEW: Assessment Domain
 * 
 * Purpose:
 * Unifies physical exam tabulation and online digital assessments. Replaces fragile 
 * legacy JSON parsing and redundant grade stores with strictly typed `edx_exam_setups`, 
 * `edx_exam_marks`, and dynamic constraints driven by Drizzle ORM schemas. Implements 
 * high-fidelity relational maps for grade compilation.
 * 
 * Replaces Legacy Tables:
 * - sm_exams / sm_exam_types / sm_exam_setups
 * - sm_marks_registers / sm_mark_stores / sm_exam_marks_registers
 * - sm_results / sm_student_promotions / all_exam_wise_positions
 * - sm_online_exams / sm_question_banks / sm_question_groups
 * - sm_exam_schedules / sm_exam_attendances
 */
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { classes, enrollments, sections, subjects } from "./domain-academic";

export const exams = sqliteTable("domain_assessment_exams", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  examType: text("exam_type", { enum: ["term", "continuous", "mock", "final"] }).notNull(),
  title: text("title", { length: 255 }).notNull(),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  percentage: real("percentage"),
  activeStatus: integer("active_status").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("exam_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const examSetups = sqliteTable("domain_assessment_exam_setups", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  classId: integer("class_id").references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  subjectId: integer("subject_id").references(() => subjects.id),
  title: text("title", { length: 255 }).notNull(), // MTA, CA, REPORT, EXAM
  examMark: real("exam_mark").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  examTargetIdx: index("exmset_exam_target_idx").on(table.examId, table.classId, table.subjectId),
}));

export const examMarks = sqliteTable("domain_assessment_exam_marks", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  examSetupId: integer("exam_setup_id").notNull().references(() => examSetups.id),
  enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
  userId: integer("user_id").notNull().references(() => users.id),
  totalMarks: real("total_marks"),
  isAbsent: integer("is_absent").notNull().default(0),
  teacherRemarks: text("teacher_remarks"),
  gradedBy: integer("graded_by").references(() => users.id), // Staff Persona
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  examStudentIdx: index("mark_exam_student_idx").on(table.examSetupId, table.userId),
}));

// --- ASSESSMENT METADATA TYPES ---

export type ComputedResultMetadata = {
  marksBreakdown: {
    subjectId: number;
    title: string[]; // e.g. ["MTA", "CA", "REPORT", "EXAM"]
    marks: number[]; // e.g. [30, 10, 10, 50]
    totalMarks: number; // e.g. 100
    outcome?: "EMERGING" | "EXPECTED" | "EXEEDING";
    grade?: "A" | "B" | "C" | "D" | "F";
  };
  totalStudents?: number;
  averageMark?: number;
  gradePoints?: number;
  subjectAverages?: Record<number, number>;
};

export const computedResults = sqliteTable("domain_assessment_computed_results", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
  totalMarks: real("total_marks"),
  gpaPoint: real("gpa_point"),
  gpaGrade: text("gpa_grade", { length: 50 }),
  teacherRemarks: text("teacher_remarks"),
  metadata: text("metadata", { mode: "json" }).$type<ComputedResultMetadata>(),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});


export const grades = sqliteTable("domain_assessment_grades", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 100 }).notNull(),
  point: real("point").notNull(),
  fromMark: real("from_mark").notNull(),
  toMark: real("to_mark").notNull(),
  description: text("description", { length: 500 }),
  academicId: integer("academic_id").references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const examSchedules = sqliteTable("domain_assessment_exam_schedules", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  examDate: text("exam_date").notNull(),
  startTime: text("start_time", { length: 20 }),
  endTime: text("end_time", { length: 20 }),
  roomNo: text("room_no", { length: 100 }),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

// Student Ratings
export const studentRatings = sqliteTable("domain_assessment_student_ratings", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  attribute: text("attribute", { length: 255 }).notNull(),
  rate: integer("rate").notNull(),
  color: text("color", { length: 50 }),
  remark: text("remark"),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  studentExamIdx: index("rat_stu_ex_idx").on(table.userId, table.examId),
}));

// Teacher Remarks
/**
 * @deprecated Use `computedResults.teacherRemarks` field instead.
 * This table is scheduled for removal in the next schema migration.
 * All data should be migrated to the `teacher_remarks` field on `computed_results`.
 */
export const teacherRemarks = sqliteTable("domain_assessment_teacher_remarks", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  staffId: integer("staff_id").references(() => users.id),
  remark: text("remark").notNull(),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  studentExamIdx: index("rem_stu_ex_idx").on(table.userId, table.examId),
}));

/**
 * NOTE: Export name `classAttendances` does NOT match DB table `class_attendance_summaries`.
 * This is intentional for brevity but may cause confusion. Consider renaming the export
 * to `classAttendanceSummaries` in a future refactor.
 */
export const classAttendances = sqliteTable("domain_assessment_class_attendance_summaries", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  daysOpened: integer("days_opened").default(0),
  daysAbsent: integer("days_absent").default(0),
  daysPresent: integer("days_present").default(0),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  studentExamIdx: index("cas_stu_ex_idx").on(table.userId, table.examId),
}));

// Question Banks
export const questionBanks = sqliteTable("domain_assessment_question_banks", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  subjectId: integer("subject_id").references(() => subjects.id),
  classId: integer("class_id").references(() => classes.id),
  questionType: text("question_type", { enum: ["mcq", "short_answer", "essay", "true_false", "fill_blank"] }).notNull(),
  question: text("question").notNull(),
  options: text("options", { mode: "json" }).$type<string[]>(),
  correctAnswer: text("correct_answer"),
  marks: real("marks").notNull(),
  difficultyLevel: text("difficulty_level", { enum: ["easy", "medium", "hard"] }).default("medium"),
  explanation: text("explanation"),
  createdBy: integer("created_by").references(() => users.id), // Staff Persona
  academicId: integer("academic_id").references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  subjectClassIdx: index("qb_subject_class_idx").on(table.subjectId, table.classId),
  tenantIdx: index("qb_tenant_idx").on(table.tenantId),
}));

// Online Exams
export const onlineExams = sqliteTable("domain_assessment_online_exams", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: text("title", { length: 255 }).notNull(),
  classId: integer("class_id").references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  subjectId: integer("subject_id").references(() => subjects.id),
  totalMarks: real("total_marks").notNull(),
  passingMarks: real("passing_marks"),
  duration: integer("duration"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  isPublished: integer("is_published").default(0),
  shuffleQuestions: integer("shuffle_questions").default(0),
  showResult: integer("show_result").default(1),
  createdBy: integer("created_by").references(() => users.id), // Staff Persona
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("oe_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

// Online Exam Questions
export const onlineExamQuestions = sqliteTable("domain_assessment_online_exam_questions", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  onlineExamId: integer("online_exam_id").notNull().references(() => onlineExams.id, { onDelete: "cascade" }),
  questionBankId: integer("question_bank_id").notNull().references(() => questionBanks.id),
  sortOrder: integer("sort_order").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  examQuestionIdx: index("oeq_exam_idx").on(table.onlineExamId),
}));

// Online Exam Attempts
export type AttemptAnswers = {
  questionId: number;
  selectedAnswer: string;
  isCorrect: boolean;
  marksAwarded: number;
}[];

export const onlineExamAttempts = sqliteTable("domain_assessment_online_exam_attempts", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  onlineExamId: integer("online_exam_id").notNull().references(() => onlineExams.id),
  userId: integer("user_id").notNull().references(() => users.id), // Student Persona
  enrollmentId: integer("enrollment_id").references(() => enrollments.id),
  totalMarks: real("total_marks"),
  obtainedMarks: real("obtained_marks"),
  status: text("status", { enum: ["in_progress", "completed", "timed_out"] }).notNull().default("in_progress"),
  answers: text("answers", { mode: "json" }).$type<AttemptAnswers>(),
  startedAt: integer("started_at", { mode: "timestamp" }).defaultNow(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  examStudentIdx: index("oea_exam_student_idx").on(table.onlineExamId, table.userId),
  tenantIdx: index("oea_tenant_idx").on(table.tenantId),
}));
