import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { smClasses, smClassTimes, smSections, smSubjects } from "./academics";
import { auditTimestamps, calendarDate, statusCheck } from "./common";
import { smStaffs, smStudents, studentRecords } from "./people";
import { smAcademicYears, smSchools } from "./tenancy";

const TERM_STATUS = ["planned", "active", "closed"] as const;

/** `05 §4.1`: this table is the term model, with `academic_id` kept as the canonical FK. */
export const smExamTypes = sqliteTable(
  "sm_exam_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    activeStatus: integer("active_status").notNull().default(1),
    name: text("name").notNull(),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    parentId: integer("parent_id").default(0),
    sequence: integer("sequence").notNull(),
    startsOn: calendarDate("starts_on"),
    endsOn: calendarDate("ends_on"),
    status: text("status", { enum: TERM_STATUS }).notNull().default("planned"),
    grading: text("grading"),
    legacySuffix: text("legacy_suffix")
  },
  (table) => [
    index("sm_exam_types_academic_id_foreign").on(table.academicId),
    index("sm_exam_types_school_id_foreign").on(table.schoolId),
    uniqueIndex("sm_exam_types_academic_id_sequence_unique").on(table.academicId, table.sequence),
    uniqueIndex("sm_exam_types_academic_id_name_unique").on(table.academicId, table.name),
    statusCheck("sm_exam_types_status_check", table.status, TERM_STATUS)
  ]
);

export const smExams = sqliteTable(
  "sm_exams",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parent_id").default(0),
    examMark: real("exam_mark"),
    passMark: real("pass_mark"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    examTypeId: integer("exam_type_id").references(() => smExamTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    classId: integer("class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    sectionId: integer("section_id").references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
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
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [
    index("sm_exams_academic_id_foreign").on(table.academicId),
    index("sm_exams_class_id_foreign").on(table.classId),
    index("sm_exams_exam_type_id_foreign").on(table.examTypeId),
    index("sm_exams_school_id_foreign").on(table.schoolId),
    index("sm_exams_section_id_foreign").on(table.sectionId),
    index("sm_exams_subject_id_foreign").on(table.subjectId),
    uniqueIndex("sm_exams_school_academic_term_class_section_subject_unique").on(
      table.schoolId,
      table.academicId,
      table.examTypeId,
      table.classId,
      table.sectionId,
      table.subjectId
    )
  ]
);

export const smExamSchedules = sqliteTable(
  "sm_exam_schedules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: calendarDate("date"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    examPeriodId: integer("exam_period_id").references(() => smClassTimes.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    roomId: integer("room_id"),
    subjectId: integer("subject_id").references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    examTermId: integer("exam_term_id").references(() => smExamTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    examId: integer("exam_id").references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    classId: integer("class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    sectionId: integer("section_id").references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    startTime: text("start_time"),
    endTime: text("end_time"),
    teacherId: integer("teacher_id").references(() => smStaffs.id, {
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
    index("sm_exam_schedules_academic_id_foreign").on(table.academicId),
    index("sm_exam_schedules_class_id_foreign").on(table.classId),
    index("sm_exam_schedules_exam_id_foreign").on(table.examId),
    index("sm_exam_schedules_exam_period_id_foreign").on(table.examPeriodId),
    index("sm_exam_schedules_exam_term_id_foreign").on(table.examTermId),
    index("sm_exam_schedules_school_id_foreign").on(table.schoolId),
    index("sm_exam_schedules_section_id_foreign").on(table.sectionId),
    index("sm_exam_schedules_subject_id_foreign").on(table.subjectId),
    index("sm_exam_schedules_teacher_id_foreign").on(table.teacherId)
  ]
);

export const smExamSetups = sqliteTable(
  "sm_exam_setups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    examTitle: text("exam_title"),
    examMark: real("exam_mark"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    examId: integer("exam_id").references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    classId: integer("class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    subjectId: integer("subject_id").references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    sectionId: integer("section_id").references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    examTermId: integer("exam_term_id").references(() => smExamTypes.id, {
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
    index("sm_exam_setups_academic_id_foreign").on(table.academicId),
    index("sm_exam_setups_class_id_foreign").on(table.classId),
    index("sm_exam_setups_exam_id_foreign").on(table.examId),
    index("sm_exam_setups_exam_term_id_foreign").on(table.examTermId),
    index("sm_exam_setups_school_id_foreign").on(table.schoolId),
    index("sm_exam_setups_section_id_foreign").on(table.sectionId),
    index("sm_exam_setups_subject_id_foreign").on(table.subjectId)
  ]
);

export const smMarkStores = sqliteTable(
  "sm_mark_stores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentRollNo: integer("student_roll_no").notNull().default(1),
    studentAddmissionNo: integer("student_addmission_no").notNull().default(1),
    totalMarks: real("total_marks").notNull(),
    isAbsent: integer("is_absent").notNull().default(1),
    teacherRemarks: text("teacher_remarks"),
    ...auditTimestamps(),
    subjectId: integer("subject_id").references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    examTermId: integer("exam_term_id").references(() => smExamTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    examSetupId: integer("exam_setup_id").references(() => smExamSetups.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    studentRecordId: integer("student_record_id").references(() => studentRecords.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    classId: integer("class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    sectionId: integer("section_id").references(() => smSections.id, {
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
    activeStatus: integer("active_status").default(1)
  },
  (table) => [
    index("sm_mark_stores_academic_id_foreign").on(table.academicId),
    index("sm_mark_stores_class_id_foreign").on(table.classId),
    index("sm_mark_stores_exam_setup_id_foreign").on(table.examSetupId),
    index("sm_mark_stores_exam_term_id_foreign").on(table.examTermId),
    index("sm_mark_stores_school_id_foreign").on(table.schoolId),
    index("sm_mark_stores_section_id_foreign").on(table.sectionId),
    index("sm_mark_stores_student_id_foreign").on(table.studentId),
    index("sm_mark_stores_student_record_id_foreign").on(table.studentRecordId),
    index("sm_mark_stores_subject_id_foreign").on(table.subjectId)
  ]
);

export const smResultStores = sqliteTable(
  "sm_result_stores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentRollNo: integer("student_roll_no").notNull().default(1),
    studentAddmissionNo: integer("student_addmission_no").notNull().default(1),
    isAbsent: integer("is_absent").notNull().default(0),
    totalMarks: real("total_marks").notNull(),
    totalGpaPoint: real("total_gpa_point"),
    totalGpaGrade: text("total_gpa_grade").default("0"),
    teacherRemarks: text("teacher_remarks"),
    ...auditTimestamps(),
    examTypeId: integer("exam_type_id").references(() => smExamTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    subjectId: integer("subject_id").references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    activeStatus: integer("active_status").default(1),
    examSetupId: integer("exam_setup_id").references(() => smExamSetups.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    studentRecordId: integer("student_record_id").references(() => studentRecords.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    classId: integer("class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    sectionId: integer("section_id").references(() => smSections.id, {
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
    index("sm_result_stores_academic_id_foreign").on(table.academicId),
    index("sm_result_stores_class_id_foreign").on(table.classId),
    index("sm_result_stores_exam_setup_id_foreign").on(table.examSetupId),
    index("sm_result_stores_exam_type_id_foreign").on(table.examTypeId),
    index("sm_result_stores_school_id_foreign").on(table.schoolId),
    index("sm_result_stores_section_id_foreign").on(table.sectionId),
    index("sm_result_stores_student_id_foreign").on(table.studentId),
    index("sm_result_stores_student_record_id_foreign").on(table.studentRecordId),
    index("sm_result_stores_subject_id_foreign").on(table.subjectId)
  ]
);

export const smMarksGrades = sqliteTable(
  "sm_marks_grades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gradeName: text("grade_name"),
    gpa: real("gpa"),
    from: real("from"),
    up: real("up"),
    percentFrom: real("percent_from"),
    percentUpto: real("percent_upto"),
    description: text("description"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    })
  },
  (table) => [
    index("sm_marks_grades_academic_id_foreign").on(table.academicId),
    index("sm_marks_grades_school_id_foreign").on(table.schoolId)
  ]
);

export const examMeritPositions = sqliteTable("exam_merit_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  classId: integer("class_id"),
  sectionId: integer("section_id"),
  examTermId: integer("exam_term_id"),
  totalMark: real("total_mark"),
  position: integer("position"),
  admissionNo: integer("admission_no"),
  gpa: real("gpa"),
  grade: text("grade"),
  recordId: integer("record_id"),
  schoolId: integer("school_id").notNull(),
  academicId: integer("academic_id").notNull(),
  activeStatus: integer("active_status").default(1),
  ...auditTimestamps()
});

export const classAttendances = sqliteTable(
  "class_attendances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    daysOpened: integer("days_opened"),
    daysAbsent: integer("days_absent"),
    daysPresent: integer("days_present"),
    ...auditTimestamps(),
    examTypeId: integer("exam_type_id").references(() => smExamTypes.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    schoolId: integer("school_id").references(() => smSchools.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    })
  },
  (table) => [
    index("class_attendances_academic_id_foreign").on(table.academicId),
    index("class_attendances_exam_type_id_foreign").on(table.examTypeId),
    index("class_attendances_school_id_foreign").on(table.schoolId),
    uniqueIndex("student_exam_unique").on(table.studentId, table.examTypeId)
  ]
);

export const smStudentAttendances = sqliteTable(
  "sm_student_attendances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    attendanceType: text("attendance_type"),
    notes: text("notes"),
    attendanceDate: calendarDate("attendance_date"),
    ...auditTimestamps(),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    recordId: integer("record_id"),
    studentRecordId: integer("student_record_id"),
    classId: integer("class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    sectionId: integer("section_id").references(() => smSections.id, {
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
    activeStatus: integer("active_status").default(1)
  },
  (table) => [
    index("sm_student_attendances_academic_id_foreign").on(table.academicId),
    index("sm_student_attendances_class_id_foreign").on(table.classId),
    index("sm_student_attendances_school_id_foreign").on(table.schoolId),
    index("sm_student_attendances_section_id_foreign").on(table.sectionId),
    index("sm_student_attendances_student_id_foreign").on(table.studentId)
  ]
);

export const studentRatings = sqliteTable(
  "student_ratings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rate: integer("rate"),
    attribute: text("attribute"),
    color: text("color"),
    remark: text("remark"),
    ...auditTimestamps(),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    examTypeId: integer("exam_type_id").references(() => smExamTypes.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    })
  },
  (table) => [
    uniqueIndex("student_id_exam_type_id_attribute").on(
      table.studentId,
      table.examTypeId,
      table.attribute
    ),
    index("student_ratings_academic_id_foreign").on(table.academicId),
    index("student_ratings_exam_type_id_foreign").on(table.examTypeId)
  ]
);

export const teacherRemarks = sqliteTable(
  "teacher_remarks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    remark: text("remark"),
    ...auditTimestamps(),
    teacherId: integer("teacher_id").references(() => smStaffs.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    examTypeId: integer("exam_type_id").references(() => smExamTypes.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    })
  },
  (table) => [
    uniqueIndex("tr_student_exam_academic_unq").on(
      table.studentId,
      table.examTypeId,
      table.academicId
    ),
    index("teacher_remarks_academic_id_foreign").on(table.academicId),
    index("teacher_remarks_exam_type_id_foreign").on(table.examTypeId),
    index("teacher_remarks_teacher_id_foreign").on(table.teacherId)
  ]
);

export const assessmentTables = [
  smExamTypes,
  smExams,
  smExamSchedules,
  smExamSetups,
  smMarkStores,
  smResultStores,
  smMarksGrades,
  examMeritPositions,
  classAttendances,
  smStudentAttendances,
  studentRatings,
  teacherRemarks
];
