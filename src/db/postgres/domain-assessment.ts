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
import { pgSchema, text, doublePrecision, integer, serial, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { classes, enrollments, sections, subjects } from "./domain-academic";
export const assessmentSchema = pgSchema("domain_assessment");


export const exams = assessmentSchema.table("exams", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  examType: varchar("exam_type", { length: 150 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  percentage: numeric("percentage", { precision: 8, scale: 2 }),
  activeStatus: smallint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("exam_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const examSetups = assessmentSchema.table("exam_setups", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  classId: integer("class_id").references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  subjectId: integer("subject_id").references(() => subjects.id),
  title: varchar("title", { length: 255 }).notNull(), // MTA, CA, REPORT, EXAM
  examMark: numeric("exam_mark", { precision: 8, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  examTargetIdx: index("exmset_exam_target_idx").on(table.examId, table.classId, table.subjectId),
}));

export const examMarks = assessmentSchema.table("exam_marks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  examSetupId: integer("exam_setup_id").notNull().references(() => examSetups.id),
  enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
  userId: integer("user_id").notNull().references(() => users.id),
  totalMarks: numeric("total_marks", { precision: 8, scale: 2 }),
  isAbsent: smallint("is_absent").notNull().default(0),
  teacherRemarks: text("teacher_remarks"),
  gradedBy: integer("graded_by").references(() => users.id), // Staff Persona
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const computedResults = assessmentSchema.table("computed_results", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
  totalMarks: numeric("total_marks", { precision: 12, scale: 2 }),
  gpaPoint: numeric("gpa_point", { precision: 8, scale: 2 }),
  gpaGrade: varchar("gpa_grade", { length: 50 }),
  teacherRemarks: text("teacher_remarks"),
  metadata: jsonb("metadata").$type<ComputedResultMetadata>(),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});


export const grades = assessmentSchema.table("grades", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  point: numeric("point", { precision: 8, scale: 2 }).notNull(),
  fromMark: numeric("from_mark", { precision: 8, scale: 2 }).notNull(),
  toMark: numeric("to_mark", { precision: 8, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }),
  academicId: integer("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const examSchedules = assessmentSchema.table("exam_schedules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").notNull().references(() => sections.id),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  examDate: date("exam_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  roomNo: varchar("room_no", { length: 100 }),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Student Ratings
export const studentRatings = assessmentSchema.table("student_ratings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  attribute: varchar("attribute", { length: 255 }).notNull(),
  rate: integer("rate").notNull(),
  color: varchar("color", { length: 50 }),
  remark: text("remark"),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  studentExamIdx: index("rat_stu_ex_idx").on(table.userId, table.examId),
}));

// Teacher Remarks
/**
 * @deprecated Use `computedResults.teacherRemarks` field instead.
 * This table is scheduled for removal in the next schema migration.
 * All data should be migrated to the `teacher_remarks` field on `computed_results`.
 */
export const teacherRemarks = assessmentSchema.table("teacher_remarks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  staffId: integer("staff_id").references(() => users.id),
  remark: text("remark").notNull(),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  studentExamIdx: index("rem_stu_ex_idx").on(table.userId, table.examId),
}));

/**
 * NOTE: Export name `classAttendances` does NOT match DB table `class_attendance_summaries`.
 * This is intentional for brevity but may cause confusion. Consider renaming the export
 * to `classAttendanceSummaries` in a future refactor.
 */
export const classAttendances = assessmentSchema.table("class_attendance_summaries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  examId: integer("exam_id").notNull().references(() => exams.id),
  daysOpened: integer("days_opened").default(0),
  daysAbsent: integer("days_absent").default(0),
  daysPresent: integer("days_present").default(0),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  studentExamIdx: index("cas_stu_ex_idx").on(table.userId, table.examId),
}));

// Question Banks
export const questionBanks = assessmentSchema.table("question_banks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  subjectId: integer("subject_id").references(() => subjects.id),
  classId: integer("class_id").references(() => classes.id),
  questionType: varchar("question_type", { length: 150 }).notNull(),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>(),
  correctAnswer: text("correct_answer"),
  marks: numeric("marks", { precision: 8, scale: 2 }).notNull(),
  difficultyLevel: varchar("difficulty_level", { length: 150 }).default("medium"),
  explanation: text("explanation"),
  createdBy: integer("created_by").references(() => users.id), // Staff Persona
  academicId: integer("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  subjectClassIdx: index("qb_subject_class_idx").on(table.subjectId, table.classId),
  tenantIdx: index("qb_tenant_idx").on(table.tenantId),
}));

// Online Exams
export const onlineExams = assessmentSchema.table("online_exams", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  classId: integer("class_id").references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  subjectId: integer("subject_id").references(() => subjects.id),
  totalMarks: numeric("total_marks", { precision: 8, scale: 2 }).notNull(),
  passingMarks: numeric("passing_marks", { precision: 8, scale: 2 }),
  duration: integer("duration"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  isPublished: smallint("is_published").default(0),
  shuffleQuestions: smallint("shuffle_questions").default(0),
  showResult: smallint("show_result").default(1),
  createdBy: integer("created_by").references(() => users.id), // Staff Persona
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("oe_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

// Online Exam Questions
export const onlineExamQuestions = assessmentSchema.table("online_exam_questions", {
  id: serial("id").primaryKey(),
  onlineExamId: integer("online_exam_id").notNull().references(() => onlineExams.id, { onDelete: "cascade" }),
  questionBankId: integer("question_bank_id").notNull().references(() => questionBanks.id),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const onlineExamAttempts = assessmentSchema.table("online_exam_attempts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  onlineExamId: integer("online_exam_id").notNull().references(() => onlineExams.id),
  userId: integer("user_id").notNull().references(() => users.id), // Student Persona
  enrollmentId: integer("enrollment_id").references(() => enrollments.id),
  totalMarks: numeric("total_marks", { precision: 8, scale: 2 }),
  obtainedMarks: numeric("obtained_marks", { precision: 8, scale: 2 }),
  status: varchar("status", { length: 150 }).notNull().default("in_progress"),
  answers: jsonb("answers").$type<AttemptAnswers>(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  examStudentIdx: index("oea_exam_student_idx").on(table.onlineExamId, table.userId),
  tenantIdx: index("oea_tenant_idx").on(table.tenantId),
}));
