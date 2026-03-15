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

import { accounts } from "./domain-core";
import { classes, sections, subjects } from "./domain-academic";

export const exams = mysqlTable("edx_exams", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  examType: mysqlEnum("exam_type", ["term", "continuous", "mock", "final"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  academicId: int("academic_id").notNull(),
  percentage: decimal("percentage", { precision: 8, scale: 2 }),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tenantAcademicIdx: index("exam_tenant_academic_idx").on(table.tenantId, table.academicId),
}));

export const examSetups = mysqlTable("edx_exam_setups", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  examId: int("exam_id").notNull().references(() => exams.id),
  classId: int("class_id").references(() => classes.id),
  sectionId: int("section_id").references(() => sections.id),
  subjectId: int("subject_id").references(() => subjects.id),
  examMark: decimal("exam_mark", { precision: 8, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  examTargetIdx: index("exmset_exam_target_idx").on(table.examId, table.classId, table.subjectId),
}));

export const examMarks = mysqlTable("edx_exam_marks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  examSetupId: int("exam_setup_id").notNull().references(() => examSetups.id),
  accountId: int("account_id").notNull().references(() => accounts.id), // Student
  totalMarks: decimal("total_marks", { precision: 8, scale: 2 }),
  isAbsent: tinyint("is_absent").notNull().default(0),
  teacherRemarks: text("teacher_remarks"),
  gradedBy: int("graded_by").references(() => accounts.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  examStudentIdx: index("mark_exam_student_idx").on(table.examSetupId, table.accountId),
}));

export const grades = mysqlTable("edx_grades", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  point: decimal("point", { precision: 8, scale: 2 }).notNull(),
  fromMark: decimal("from_mark", { precision: 8, scale: 2 }).notNull(),
  toMark: decimal("to_mark", { precision: 8, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const examSchedules = mysqlTable("edx_exam_schedules", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  examId: int("exam_id").notNull().references(() => exams.id),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  examDate: date("exam_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  roomNo: varchar("room_no", { length: 100 }),
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const computedResults = mysqlTable("edx_computed_results", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  accountId: int("account_id").notNull().references(() => accounts.id), // Student
  examId: int("exam_id").notNull().references(() => exams.id),
  classId: int("class_id").notNull().references(() => classes.id),
  sectionId: int("section_id").notNull().references(() => sections.id),
  totalMarks: decimal("total_marks", { precision: 12, scale: 2 }),
  gpaPoint: decimal("gpa_point", { precision: 8, scale: 2 }),
  gpaGrade: varchar("gpa_grade", { length: 50 }),
  teacherRemarks: text("teacher_remarks"),
  metadata: json("metadata").$type<any>(),
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
