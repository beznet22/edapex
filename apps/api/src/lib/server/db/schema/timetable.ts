import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { smClasses, smClassRooms, smClassTimes, smSections, smSubjects } from "./academics";
import { auditTimestamps, boolean01, calendarDate } from "./common";
import { smStaffs } from "./people";
import { smAcademicYears, smSchools } from "./tenancy";

export const smAssignSubjects = sqliteTable(
  "sm_assign_subjects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    teacherId: integer("teacher_id").references(() => smStaffs.id, {
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
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    parentId: integer("parent_id")
  },
  (table) => [
    index("sm_assign_subjects_academic_id_foreign").on(table.academicId),
    index("sm_assign_subjects_class_id_foreign").on(table.classId),
    index("sm_assign_subjects_school_id_foreign").on(table.schoolId),
    index("sm_assign_subjects_section_id_foreign").on(table.sectionId),
    index("sm_assign_subjects_subject_id_foreign").on(table.subjectId),
    index("sm_assign_subjects_teacher_id_foreign").on(table.teacherId)
  ]
);

export const smClassSections = sqliteTable(
  "sm_class_sections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    classId: integer("class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    sectionId: integer("section_id").references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    parentId: integer("parent_id")
  },
  (table) => [
    index("sm_class_sections_academic_id_foreign").on(table.academicId),
    index("sm_class_sections_class_id_section_id_index").on(table.classId, table.sectionId),
    index("sm_class_sections_school_id_foreign").on(table.schoolId),
    index("sm_class_sections_section_id_foreign").on(table.sectionId)
  ]
);

export const smAssignClassTeachers = sqliteTable(
  "sm_assign_class_teachers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
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
    index("sm_assign_class_teachers_academic_id_foreign").on(table.academicId),
    index("sm_assign_class_teachers_class_id_foreign").on(table.classId),
    index("sm_assign_class_teachers_school_id_foreign").on(table.schoolId),
    index("sm_assign_class_teachers_section_id_foreign").on(table.sectionId)
  ]
);

export const smClassTeachers = sqliteTable(
  "sm_class_teachers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    teacherId: integer("teacher_id").references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    assignClassTeacherId: integer("assign_class_teacher_id").references(() => smAssignClassTeachers.id, {
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
    index("sm_class_teachers_academic_id_foreign").on(table.academicId),
    index("sm_class_teachers_assign_class_teacher_id_foreign").on(table.assignClassTeacherId),
    index("sm_class_teachers_school_id_foreign").on(table.schoolId),
    index("sm_class_teachers_teacher_id_foreign").on(table.teacherId)
  ]
);

export const smClassRoutines = sqliteTable(
  "sm_class_routines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monday: text("monday"),
    mondayStartFrom: text("monday_start_from"),
    mondayEndTo: text("monday_end_to"),
    mondayRoomId: integer("monday_room_id"),
    tuesday: text("tuesday"),
    tuesdayStartFrom: text("tuesday_start_from"),
    tuesdayEndTo: text("tuesday_end_to"),
    tuesdayRoomId: integer("tuesday_room_id"),
    wednesday: text("wednesday"),
    wednesdayStartFrom: text("wednesday_start_from"),
    wednesdayEndTo: text("wednesday_end_to"),
    wednesdayRoomId: integer("wednesday_room_id"),
    thursday: text("thursday"),
    thursdayStartFrom: text("thursday_start_from"),
    thursdayEndTo: text("thursday_end_to"),
    thursdayRoomId: integer("thursday_room_id"),
    friday: text("friday"),
    fridayStartFrom: text("friday_start_from"),
    fridayEndTo: text("friday_end_to"),
    fridayRoomId: integer("friday_room_id"),
    saturday: text("saturday"),
    saturdayStartFrom: text("saturday_start_from"),
    saturdayEndTo: text("saturday_end_to"),
    saturdayRoomId: integer("saturday_room_id"),
    sunday: text("sunday"),
    sundayStartFrom: text("sunday_start_from"),
    sundayEndTo: text("sunday_end_to"),
    sundayRoomId: integer("sunday_room_id"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
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
    index("sm_class_routines_academic_id_foreign").on(table.academicId),
    index("sm_class_routines_class_id_foreign").on(table.classId),
    index("sm_class_routines_school_id_foreign").on(table.schoolId),
    index("sm_class_routines_section_id_foreign").on(table.sectionId),
    index("sm_class_routines_subject_id_foreign").on(table.subjectId)
  ]
);

export const smClassRoutineUpdates = sqliteTable(
  "sm_class_routine_updates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    day: integer("day"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    isBreak: integer("is_break"),
    roomId: integer("room_id").references(() => smClassRooms.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    teacherId: integer("teacher_id").references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    classPeriodId: integer("class_period_id").references(() => smClassTimes.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    subjectId: integer("subject_id").references(() => smSubjects.id, {
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
    index("sm_class_routine_updates_academic_id_foreign").on(table.academicId),
    index("sm_class_routine_updates_class_id_foreign").on(table.classId),
    index("sm_class_routine_updates_class_period_id_foreign").on(table.classPeriodId),
    index("sm_class_routine_updates_room_id_foreign").on(table.roomId),
    index("sm_class_routine_updates_school_id_foreign").on(table.schoolId),
    index("sm_class_routine_updates_section_id_foreign").on(table.sectionId),
    index("sm_class_routine_updates_subject_id_foreign").on(table.subjectId),
    index("sm_class_routine_updates_teacher_id_foreign").on(table.teacherId)
  ]
);

export const smEvents = sqliteTable(
  "sm_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventTitle: text("event_title"),
    forWhom: text("for_whom"),
    roleIds: text("role_ids"),
    url: text("url"),
    eventLocation: text("event_location"),
    eventDes: text("event_des"),
    fromDate: calendarDate("from_date"),
    toDate: calendarDate("to_date"),
    upladImageFile: text("uplad_image_file"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
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
    index("sm_events_academic_id_foreign").on(table.academicId),
    index("sm_events_school_id_foreign").on(table.schoolId)
  ]
);

export const smHolidays = sqliteTable(
  "sm_holidays",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    holidayTitle: text("holiday_title"),
    details: text("details"),
    fromDate: calendarDate("from_date"),
    toDate: calendarDate("to_date"),
    uploadImageFile: text("upload_image_file"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
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
    index("sm_holidays_academic_id_foreign").on(table.academicId),
    index("sm_holidays_school_id_foreign").on(table.schoolId)
  ]
);

export const smNoticeBoards = sqliteTable(
  "sm_notice_boards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    noticeTitle: text("notice_title"),
    noticeMessage: text("notice_message"),
    noticeDate: calendarDate("notice_date"),
    publishOn: calendarDate("publish_on"),
    informTo: text("inform_to"),
    activeStatus: boolean01("active_status", 1),
    isPublished: integer("is_published").default(0),
    ...auditTimestamps(),
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
    index("sm_notice_boards_academic_id_foreign").on(table.academicId),
    index("sm_notice_boards_school_id_foreign").on(table.schoolId)
  ]
);

/** `05` closes the schema-drift finding: the surrogate key is a real primary key here. */
export const chatGroups = sqliteTable(
  "chat_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    photoUrl: text("photo_url"),
    privacy: integer("privacy"),
    readOnly: boolean01("read_only"),
    groupType: integer("group_type").notNull().default(1),
    createdBy: integer("created_by").notNull(),
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
    teacherId: integer("teacher_id").references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    schoolId: integer("school_id").references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    ...auditTimestamps()
  },
  (table) => [
    index("chat_groups_academic_id_foreign").on(table.academicId),
    index("chat_groups_class_id_foreign").on(table.classId),
    index("chat_groups_school_id_foreign").on(table.schoolId),
    index("chat_groups_section_id_foreign").on(table.sectionId),
    index("chat_groups_subject_id_foreign").on(table.subjectId),
    index("chat_groups_teacher_id_foreign").on(table.teacherId)
  ]
);

export const chatGroupUsers = sqliteTable(
  "chat_group_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: text("group_id").notNull(),
    userId: integer("user_id").notNull(),
    role: integer("role").notNull().default(1),
    addedBy: integer("added_by").notNull(),
    removedBy: integer("removed_by"),
    deletedAt: integer("deleted_at"),
    ...auditTimestamps()
  },
  (table) => [
    index("chat_group_users_group_id_user_id_index").on(table.groupId, table.userId),
    index("chat_group_users_user_id_index").on(table.userId)
  ]
);

export const timetableTables = [
  smAssignSubjects,
  smClassSections,
  smAssignClassTeachers,
  smClassTeachers,
  smClassRoutines,
  smClassRoutineUpdates,
  smEvents,
  smHolidays,
  smNoticeBoards,
  chatGroups,
  chatGroupUsers
];
