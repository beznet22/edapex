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

export const exams = mysqlTable("exams", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  examType: mysqlEnum("exam_type", ["term", "continuous", "mock", "final"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  percentage: decimal("percentage", { precision: 8, scale: 2 }),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("exam_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const examSetups = mysqlTable("exam_setups", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  examId: int("exam_id").notNull().references(() => exams.id),
  classId: int("class_id").references(() => classes.id),
  sectionId: int("section_id").references(() => sections.id),
  subjectId: int("subject_id").references(() => subjects.id),
  title: varchar("title", { length: 255 }).notNull(), // MTA, CA, REPORT, EXAM
  examMark: decimal("exam_mark", { precision: 8, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  examTargetIdx: index("exmset_exam_target_idx").on(table.examId, table.classId, table.subjectId),
}));

export const examMarks = mysqlTable("exam_marks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  examSetupId: int("exam_setup_id").notNull().references(() => examSetups.id),
  enrollmentId: int("enrollment_id").notNull().references(() => enrollments.id),
  userId: int("user_id").notNull().references(() => users.id),
  totalMarks: decimal("total_marks", { precision: 8, scale: 2 }),
  isAbsent: tinyint("is_absent").notNull().default(0),
  teacherRemarks: text("teacher_remarks"),
  gradedBy: int("graded_by").references(() => users.id), // Staff Persona
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
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

export const computedResults = mysqlTable("computed_results", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id),
  examId: int("exam_id").notNull().references(() => exams.id),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  enrollmentId: int("enrollment_id").notNull().references(() => enrollments.id),
  totalMarks: decimal("total_marks", { precision: 12, scale: 2 }),
  gpaPoint: decimal("gpa_point", { precision: 8, scale: 2 }),
  gpaGrade: varchar("gpa_grade", { length: 50 }),
  teacherRemarks: text("teacher_remarks"),
  metadata: json("metadata").$type<ComputedResultMetadata>(),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});


export const grades = mysqlTable("grades", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  point: decimal("point", { precision: 8, scale: 2 }).notNull(),
  fromMark: decimal("from_mark", { precision: 8, scale: 2 }).notNull(),
  toMark: decimal("to_mark", { precision: 8, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }),
  academicId: int("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const examSchedules = mysqlTable("exam_schedules", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  examId: int("exam_id").notNull().references(() => exams.id),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  examDate: date("exam_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  roomNo: varchar("room_no", { length: 100 }),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Student Ratings
export const studentRatings = mysqlTable("student_ratings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id),
  examId: int("exam_id").notNull().references(() => exams.id),
  attribute: varchar("attribute", { length: 255 }).notNull(),
  rate: int("rate").notNull(),
  color: varchar("color", { length: 50 }),
  remark: text("remark"),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  studentExamIdx: index("rat_stu_ex_idx").on(table.userId, table.examId),
}));

// Teacher Remarks
// TODO: Use computedResults.teacherRemarks field instead, and remove this table.
export const teacherRemarks = mysqlTable("teacher_remarks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id),
  examId: int("exam_id").notNull().references(() => exams.id),
  staffId: int("staff_id").references(() => users.id),
  remark: text("remark").notNull(),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  studentExamIdx: index("rem_stu_ex_idx").on(table.userId, table.examId),
}));

// Class Attendances Summary
export const classAttendances = mysqlTable("class_attendance_summaries", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id),
  examId: int("exam_id").notNull().references(() => exams.id),
  daysOpened: int("days_opened").default(0),
  daysAbsent: int("days_absent").default(0),
  daysPresent: int("days_present").default(0),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  studentExamIdx: index("cas_stu_ex_idx").on(table.userId, table.examId),
}));

// Question Banks
export const questionBanks = mysqlTable("question_banks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  subjectId: int("subject_id").references(() => subjects.id),
  classId: int("class_id").references(() => classes.id),
  questionType: mysqlEnum("question_type", ["mcq", "short_answer", "essay", "true_false", "fill_blank"]).notNull(),
  question: text("question").notNull(),
  options: json("options").$type<string[]>(),
  correctAnswer: text("correct_answer"),
  marks: decimal("marks", { precision: 8, scale: 2 }).notNull(),
  difficultyLevel: mysqlEnum("difficulty_level", ["easy", "medium", "hard"]).default("medium"),
  explanation: text("explanation"),
  createdBy: int("created_by").references(() => users.id), // Staff Persona
  academicId: int("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  subjectClassIdx: index("qb_subject_class_idx").on(table.subjectId, table.classId),
  tenantIdx: index("qb_tenant_idx").on(table.tenantId),
}));

// Online Exams
export const onlineExams = mysqlTable("online_exams", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  classId: int("class_id").references(() => classes.id),
  sectionId: int("section_id").references(() => sections.id),
  subjectId: int("subject_id").references(() => subjects.id),
  totalMarks: decimal("total_marks", { precision: 8, scale: 2 }).notNull(),
  passingMarks: decimal("passing_marks", { precision: 8, scale: 2 }),
  duration: int("duration"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  isPublished: tinyint("is_published").default(0),
  shuffleQuestions: tinyint("shuffle_questions").default(0),
  showResult: tinyint("show_result").default(1),
  createdBy: int("created_by").references(() => users.id), // Staff Persona
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantAcademicIdx: index("oe_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

// Online Exam Questions
export const onlineExamQuestions = mysqlTable("online_exam_questions", {
  id: int("id").autoincrement().primaryKey(),
  onlineExamId: int("online_exam_id").notNull().references(() => onlineExams.id, { onDelete: "cascade" }),
  questionBankId: int("question_bank_id").notNull().references(() => questionBanks.id),
  sortOrder: int("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
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

export const onlineExamAttempts = mysqlTable("online_exam_attempts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  onlineExamId: int("online_exam_id").notNull().references(() => onlineExams.id),
  userId: int("user_id").notNull().references(() => users.id), // Student Persona
  enrollmentId: int("enrollment_id").references(() => enrollments.id),
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
