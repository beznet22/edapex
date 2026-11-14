import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import { auditTimestamps, boolean01, statusCheck } from "./common";
import { smAcademicYears, smSchools, users } from "./tenancy";

const CLASS_STAGE = ["EARLY_YEARS", "LOWER_BASIC", "MIDDLE_BASIC", "UPPER_BASIC"] as const;
const SUBJECT_TYPE = ["T", "P"] as const;
const PERIOD_TYPE = ["exam", "class"] as const;

export const smClasses = sqliteTable(
  "sm_classes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    className: text("class_name").notNull(),
    passMark: real("pass_mark"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    parentId: integer("parent_id"),
    stage: text("stage", { enum: CLASS_STAGE }),
    nextClassId: integer("next_class_id").references((): AnySQLiteColumn => smClasses.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    sortOrder: integer("sort_order")
  },
  (table) => [
    index("sm_classes_academic_id_foreign").on(table.academicId),
    index("sm_classes_school_id_foreign").on(table.schoolId),
    statusCheck("sm_classes_stage_check", table.stage, CLASS_STAGE)
  ]
);

export const smSections = sqliteTable(
  "sm_sections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parent_id"),
    sectionName: text("section_name").notNull(),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    unAcademicId: integer("un_academic_id"),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [
    index("sm_sections_academic_id_foreign").on(table.academicId),
    index("sm_sections_school_id_foreign").on(table.schoolId)
  ]
);

export const smSubjects = sqliteTable(
  "sm_subjects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subjectName: text("subject_name").notNull(),
    subjectCode: text("subject_code"),
    passMark: real("pass_mark"),
    subjectType: text("subject_type", { enum: SUBJECT_TYPE }).notNull(),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
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
    index("sm_subjects_academic_id_foreign").on(table.academicId),
    index("sm_subjects_school_id_foreign").on(table.schoolId)
  ]
);

export const smStudentCategories = sqliteTable(
  "sm_student_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryName: text("category_name"),
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
    index("sm_student_categories_academic_id_foreign").on(table.academicId),
    index("sm_student_categories_school_id_foreign").on(table.schoolId)
  ]
);

export const smBaseGroups = sqliteTable(
  "sm_base_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [index("sm_base_groups_school_id_foreign").on(table.schoolId)]
);

export const smBaseSetups = sqliteTable(
  "sm_base_setups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    baseSetupName: text("base_setup_name").notNull(),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    baseGroupId: integer("base_group_id")
      .default(1)
      .references(() => smBaseGroups.id, { onDelete: "cascade", onUpdate: "restrict" }),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [
    index("sm_base_setups_base_group_id_foreign").on(table.baseGroupId),
    index("sm_base_setups_school_id_foreign").on(table.schoolId)
  ]
);

export const smDesignations = sqliteTable(
  "sm_designations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [index("sm_designations_school_id_foreign").on(table.schoolId)]
);

export const smHumanDepartments = sqliteTable(
  "sm_human_departments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    createdBy: integer("created_by")
      .default(1)
      .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
    updatedBy: integer("updated_by")
      .default(1)
      .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    isSaas: integer("is_saas").default(0)
  },
  (table) => [
    index("sm_human_departments_created_by_foreign").on(table.createdBy),
    index("sm_human_departments_school_id_foreign").on(table.schoolId),
    index("sm_human_departments_updated_by_foreign").on(table.updatedBy)
  ]
);

export const smClassTimes = sqliteTable(
  "sm_class_times",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: PERIOD_TYPE }),
    period: text("period"),
    startTime: text("start_time"),
    endTime: text("end_time"),
    isBreak: integer("is_break"),
    ...auditTimestamps(),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [
    index("sm_class_times_academic_id_foreign").on(table.academicId),
    index("sm_class_times_school_id_foreign").on(table.schoolId)
  ]
);

export const smClassRooms = sqliteTable(
  "sm_class_rooms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomNo: text("room_no"),
    capacity: integer("capacity"),
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
    index("sm_class_rooms_academic_id_foreign").on(table.academicId),
    index("sm_class_rooms_school_id_foreign").on(table.schoolId)
  ]
);

export const academicsTables = [
  smClasses,
  smSections,
  smSubjects,
  smStudentCategories,
  smBaseGroups,
  smBaseSetups,
  smDesignations,
  smHumanDepartments,
  smClassTimes,
  smClassRooms
];
