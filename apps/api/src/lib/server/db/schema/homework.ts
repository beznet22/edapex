import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { smClasses, smSubjects } from "./academics";
import { auditTimestamps, calendarDate } from "./common";
import { smStudents } from "./people";
import { smAcademicYears, smSchools, users } from "./tenancy";

export const smHomeworks = sqliteTable(
  "sm_homeworks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    homeworkDate: calendarDate("homework_date"),
    submissionDate: calendarDate("submission_date"),
    evaluationDate: calendarDate("evaluation_date"),
    file: text("file"),
    marks: text("marks"),
    description: text("description"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    evaluatedBy: integer("evaluated_by").references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    classId: integer("class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    recordId: integer("record_id"),
    sectionId: integer("section_id"),
    subjectId: integer("subject_id").references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    courseId: integer("course_id"),
    lessonId: integer("lesson_id"),
    chapterId: integer("chapter_id")
  },
  (table) => [
    index("sm_homeworks_academic_id_foreign").on(table.academicId),
    index("sm_homeworks_class_id_foreign").on(table.classId),
    index("sm_homeworks_evaluated_by_foreign").on(table.evaluatedBy),
    index("sm_homeworks_school_id_foreign").on(table.schoolId),
    index("sm_homeworks_subject_id_foreign").on(table.subjectId)
  ]
);

export const smHomeworkStudents = sqliteTable(
  "sm_homework_students",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marks: text("marks"),
    teacherComments: text("teacher_comments"),
    completeStatus: text("complete_status"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    homeworkId: integer("homework_id").references(() => smHomeworks.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [
    index("sm_homework_students_academic_id_foreign").on(table.academicId),
    index("sm_homework_students_homework_id_foreign").on(table.homeworkId),
    index("sm_homework_students_school_id_foreign").on(table.schoolId),
    index("sm_homework_students_student_id_foreign").on(table.studentId)
  ]
);

export const homeworkTables = [smHomeworks, smHomeworkStudents];
