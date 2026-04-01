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
import { classes, enrollments, sections, subjects } from "./domain-academic";
import { generateId } from "../utils/id";

export const exams = mysqlTable("exams", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  examType: mysqlEnum("exam_type", ["term", "continuous", "mock", "final"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  percentage: decimal("percentage", { precision: 8, scale: 2 }),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("exam_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const examSetups = mysqlTable("exam_setups", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  examId: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id),
  classId: varchar("class_id", { length: 36 }).references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).references(() => sections.id),
  subjectId: varchar("subject_id", { length: 36 }).references(() => subjects.id),
  title: varchar("title", { length: 255 }).notNull(), // MTA, CA, REPORT, EXAM
  examMark: decimal("exam_mark", { precision: 8, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  examTargetIdx: index("exmset_exam_target_idx").on(table.examId, table.classId, table.subjectId),
}));

export const examMarks = mysqlTable("exam_marks", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  examSetupId: varchar("exam_setup_id", { length: 36 }).notNull().references(() => examSetups.id),
  enrollmentId: varchar("enrollment_id", { length: 36 }).notNull().references(() => enrollments.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  totalMarks: decimal("total_marks", { precision: 8, scale: 2 }),
  isAbsent: tinyint("is_absent").notNull().default(0),
  teacherRemarks: text("teacher_remarks"),
  gradedBy: varchar("graded_by", { length: 36 }).references(() => users.id), // Staff Persona
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  examStudentIdx: index("mark_exam_student_idx").on(table.examSetupId, table.userId),
}));

// --- ASSESSMENT METADATA TYPES ---

export type ComputedResultMetadata = {
  marksBreakdown: {
    subjectId: string;
    title: string[]; // e.g. ["MTA", "CA", "REPORT", "EXAM"]
    marks: number[]; // e.g. [30, 10, 10, 50]
    totalMarks: number; // e.g. 100
    outcome?: "EMERGING" | "EXPECTED" | "EXEEDING";
    grade?: "A" | "B" | "C" | "D" | "F";
  };
  totalStudents?: number;
  averageMark?: number;
  gradePoints?: number;
  subjectAverages?: Record<string, number>;
};

export const computedResults = mysqlTable("computed_results", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  examId: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id),
  classId: varchar("class_id", { length: 36 }).notNull().references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).notNull().references(() => sections.id),
  enrollmentId: varchar("enrollment_id", { length: 36 }).notNull().references(() => enrollments.id),
  totalMarks: decimal("total_marks", { precision: 12, scale: 2 }),
  gpaPoint: decimal("gpa_point", { precision: 8, scale: 2 }),
  gpaGrade: varchar("gpa_grade", { length: 50 }),
  teacherRemarks: text("teacher_remarks"),
  metadata: json("metadata").$type<ComputedResultMetadata>(),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});


export const grades = mysqlTable("grades", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  point: decimal("point", { precision: 8, scale: 2 }).notNull(),
  fromMark: decimal("from_mark", { precision: 8, scale: 2 }).notNull(),
  toMark: decimal("to_mark", { precision: 8, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }),
  academicId: varchar("academic_id", { length: 36 }).references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const examSchedules = mysqlTable("exam_schedules", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  examId: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id),
  classId: varchar("class_id", { length: 36 }).notNull().references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).notNull().references(() => sections.id),
  subjectId: varchar("subject_id", { length: 36 }).notNull().references(() => subjects.id),
  examDate: date("exam_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  roomNo: varchar("room_no", { length: 100 }),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Student Ratings
export const studentRatings = mysqlTable("student_ratings", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  examId: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id),
  attribute: varchar("attribute", { length: 255 }).notNull(),
  rate: int("rate").notNull(),
  color: varchar("color", { length: 50 }),
  remark: text("remark"),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  studentExamIdx: index("rat_stu_ex_idx").on(table.userId, table.examId),
}));

// Teacher Remarks
/**
 * @deprecated Use `computedResults.teacherRemarks` field instead.
 * This table is scheduled for removal in the next schema migration.
 * All data should be migrated to the `teacher_remarks` field on `computed_results`.
 */
export const teacherRemarks = mysqlTable("teacher_remarks", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  examId: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id),
  staffId: varchar("staff_id", { length: 36 }).references(() => users.id),
  remark: text("remark").notNull(),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  studentExamIdx: index("rem_stu_ex_idx").on(table.userId, table.examId),
}));

/**
 * NOTE: Export name `classAttendances` does NOT match DB table `class_attendance_summaries`.
 * This is intentional for brevity but may cause confusion. Consider renaming the export
 * to `classAttendanceSummaries` in a future refactor.
 */
export const classAttendances = mysqlTable("class_attendance_summaries", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  examId: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id),
  daysOpened: int("days_opened").default(0),
  daysAbsent: int("days_absent").default(0),
  daysPresent: int("days_present").default(0),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  studentExamIdx: index("cas_stu_ex_idx").on(table.userId, table.examId),
}));

// Question Banks
export const questionBanks = mysqlTable("question_banks", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  subjectId: varchar("subject_id", { length: 36 }).references(() => subjects.id),
  classId: varchar("class_id", { length: 36 }).references(() => classes.id),
  questionType: mysqlEnum("question_type", ["mcq", "short_answer", "essay", "true_false", "fill_blank"]).notNull(),
  question: text("question").notNull(),
  options: json("options").$type<string[]>(),
  correctAnswer: text("correct_answer"),
  marks: decimal("marks", { precision: 8, scale: 2 }).notNull(),
  difficultyLevel: mysqlEnum("difficulty_level", ["easy", "medium", "hard"]).default("medium"),
  explanation: text("explanation"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id), // Staff Persona
  academicId: varchar("academic_id", { length: 36 }).references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  subjectClassIdx: index("qb_subject_class_idx").on(table.subjectId, table.classId),
  tenantIdx: index("qb_tenant_idx").on(table.tenantId),
}));

// Online Exams
export const onlineExams = mysqlTable("online_exams", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  classId: varchar("class_id", { length: 36 }).references(() => classes.id),
  sectionId: varchar("section_id", { length: 36 }).references(() => sections.id),
  subjectId: varchar("subject_id", { length: 36 }).references(() => subjects.id),
  totalMarks: decimal("total_marks", { precision: 8, scale: 2 }).notNull(),
  passingMarks: decimal("passing_marks", { precision: 8, scale: 2 }),
  duration: int("duration"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  isPublished: tinyint("is_published").default(0),
  shuffleQuestions: tinyint("shuffle_questions").default(0),
  showResult: tinyint("show_result").default(1),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id), // Staff Persona
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("oe_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

// Online Exam Questions
export const onlineExamQuestions = mysqlTable("online_exam_questions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  onlineExamId: varchar("online_exam_id", { length: 36 }).notNull().references(() => onlineExams.id, { onDelete: "cascade" }),
  questionBankId: varchar("question_bank_id", { length: 36 }).notNull().references(() => questionBanks.id),
  sortOrder: int("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  examQuestionIdx: index("oeq_exam_idx").on(table.onlineExamId),
  tenantExamIdx: index("oeq_tenant_ex_idx").on(table.tenantId, table.onlineExamId),
}));

// Online Exam Attempts
export type AttemptAnswers = {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  marksAwarded: number;
}[];

export const onlineExamAttempts = mysqlTable("online_exam_attempts", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  onlineExamId: varchar("online_exam_id", { length: 36 }).notNull().references(() => onlineExams.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Student Persona
  enrollmentId: varchar("enrollment_id", { length: 36 }).references(() => enrollments.id),
  totalMarks: decimal("total_marks", { precision: 8, scale: 2 }),
  obtainedMarks: decimal("obtained_marks", { precision: 8, scale: 2 }),
  status: mysqlEnum("status", ["in_progress", "completed", "timed_out"]).notNull().default("in_progress"),
  answers: json("answers").$type<AttemptAnswers>(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  examStudentIdx: index("oea_exam_student_idx").on(table.onlineExamId, table.userId),
  tenantIdx: index("oea_tenant_idx").on(table.tenantId),
}));
