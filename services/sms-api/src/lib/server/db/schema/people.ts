import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import {
  smBaseSetups,
  smClasses,
  smDesignations,
  smHumanDepartments,
  smSections,
  smStudentCategories
} from "./academics";
import { auditTimestamps, boolean01, calendarDate, moneyMinorUnits, statusCheck } from "./common";
import {
  infixRoles,
  smAcademicYears,
  smSchools,
  users
} from "./tenancy";

const STUDENT_STATUS = ["active", "graduated", "withdrawn", "left"] as const;
const RECORD_STATUS = ["current", "promoted", "repeated", "graduated", "withdrawn"] as const;

export const smStaffs = sqliteTable(
  "sm_staffs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    staffNo: integer("staff_no"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name"),
    fathersName: text("fathers_name"),
    mothersName: text("mothers_name"),
    dateOfBirth: calendarDate("date_of_birth").default("2024-11-04"),
    dateOfJoining: calendarDate("date_of_joining").default("2024-11-04"),
    email: text("email"),
    mobile: text("mobile"),
    emergencyMobile: text("emergency_mobile"),
    maritalStatus: text("marital_status"),
    meritalStatus: text("merital_status"),
    staffPhoto: text("staff_photo"),
    currentAddress: text("current_address"),
    permanentAddress: text("permanent_address"),
    qualification: text("qualification"),
    experience: text("experience"),
    epfNo: text("epf_no"),
    basicSalary: text("basic_salary"),
    contractType: text("contract_type"),
    location: text("location"),
    casualLeave: text("casual_leave"),
    medicalLeave: text("medical_leave"),
    metarnityLeave: text("metarnity_leave"),
    bankAccountName: text("bank_account_name"),
    bankAccountNo: text("bank_account_no"),
    bankName: text("bank_name"),
    bankBrach: text("bank_brach"),
    facebookUrl: text("facebook_url"),
    twiteerUrl: text("twiteer_url"),
    linkedinUrl: text("linkedin_url"),
    instragramUrl: text("instragram_url"),
    joiningLetter: text("joining_letter"),
    resume: text("resume"),
    otherDocument: text("other_document"),
    notes: text("notes"),
    activeStatus: boolean01("active_status", 1),
    showPublic: boolean01("show_public"),
    drivingLicense: text("driving_license"),
    drivingLicenseExDate: calendarDate("driving_license_ex_date"),
    customField: text("custom_field"),
    customFieldFormName: text("custom_field_form_name"),
    ...auditTimestamps(),
    designationId: integer("designation_id")
      .default(1)
      .references(() => smDesignations.id, { onDelete: "set null", onUpdate: "restrict" }),
    departmentId: integer("department_id")
      .default(1)
      .references(() => smHumanDepartments.id, { onDelete: "set null", onUpdate: "restrict" }),
    userId: integer("user_id")
      .default(1)
      .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
    parentId: integer("parent_id"),
    roleId: integer("role_id")
      .default(1)
      .references(() => infixRoles.id, { onDelete: "set null", onUpdate: "restrict" }),
    previousRoleId: integer("previous_role_id"),
    genderId: integer("gender_id")
      .default(1)
      .references(() => smBaseSetups.id, { onDelete: "set null", onUpdate: "restrict" }),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    isSaas: integer("is_saas").default(0)
  },
  (table) => [
    index("sm_staffs_department_id_foreign").on(table.departmentId),
    index("sm_staffs_designation_id_foreign").on(table.designationId),
    index("sm_staffs_gender_id_foreign").on(table.genderId),
    index("sm_staffs_role_id_foreign").on(table.roleId),
    index("sm_staffs_school_id_foreign").on(table.schoolId),
    index("sm_staffs_user_id_foreign").on(table.userId)
  ]
);

export const smParents = sqliteTable(
  "sm_parents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fathersName: text("fathers_name"),
    fathersMobile: text("fathers_mobile"),
    fathersOccupation: text("fathers_occupation"),
    fathersPhoto: text("fathers_photo"),
    mothersName: text("mothers_name"),
    mothersMobile: text("mothers_mobile"),
    mothersOccupation: text("mothers_occupation"),
    mothersPhoto: text("mothers_photo"),
    relation: text("relation"),
    guardiansName: text("guardians_name"),
    guardiansMobile: text("guardians_mobile"),
    guardiansEmail: text("guardians_email"),
    guardiansOccupation: text("guardians_occupation"),
    guardiansRelation: text("guardians_relation"),
    guardiansPhoto: text("guardians_photo"),
    guardiansAddress: text("guardians_address"),
    isGuardian: integer("is_guardian"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    userId: integer("user_id")
      .default(1)
      .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [
    index("sm_parents_academic_id_foreign").on(table.academicId),
    index("sm_parents_school_id_foreign").on(table.schoolId),
    index("sm_parents_user_id_foreign").on(table.userId)
  ]
);

export const smStudents = sqliteTable(
  "sm_students",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    admissionNo: integer("admission_no"),
    rollNo: integer("roll_no"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name"),
    dateOfBirth: calendarDate("date_of_birth"),
    caste: text("caste"),
    email: text("email"),
    mobile: text("mobile"),
    admissionDate: calendarDate("admission_date"),
    studentPhoto: text("student_photo"),
    age: text("age"),
    height: text("height"),
    weight: text("weight"),
    currentAddress: text("current_address"),
    permanentAddress: text("permanent_address"),
    driverId: text("driver_id"),
    nationalIdNo: text("national_id_no"),
    localIdNo: text("local_id_no"),
    bankAccountNo: text("bank_account_no"),
    bankName: text("bank_name"),
    previousSchoolDetails: text("previous_school_details"),
    aditionalNotes: text("aditional_notes"),
    ifscCode: text("ifsc_code"),
    documentTitle1: text("document_title_1"),
    documentFile1: text("document_file_1"),
    documentTitle2: text("document_title_2"),
    documentFile2: text("document_file_2"),
    documentTitle3: text("document_title_3"),
    documentFile3: text("document_file_3"),
    documentTitle4: text("document_title_4"),
    documentFile4: text("document_file_4"),
    activeStatus: boolean01("active_status", 1),
    customField: text("custom_field"),
    customFieldFormName: text("custom_field_form_name"),
    ...auditTimestamps(),
    bloodgroupId: integer("bloodgroup_id")
      .default(1)
      .references(() => smBaseSetups.id, { onDelete: "set null", onUpdate: "restrict" }),
    religionId: integer("religion_id")
      .default(1)
      .references(() => smBaseSetups.id, { onDelete: "set null", onUpdate: "restrict" }),
    routeListId: integer("route_list_id")
      .default(1)
      .references(() => smRoutes.id, { onDelete: "set null", onUpdate: "restrict" }),
    dormitoryId: integer("dormitory_id")
      .default(1)
      .references(() => smDormitoryLists.id, { onDelete: "set null", onUpdate: "restrict" }),
    vechileId: integer("vechile_id")
      .default(1)
      .references(() => smVehicles.id, { onDelete: "set null", onUpdate: "restrict" }),
    roomId: integer("room_id")
      .default(1)
      .references(() => smRoomLists.id, { onDelete: "set null", onUpdate: "restrict" }),
    studentCategoryId: integer("student_category_id")
      .default(1)
      .references(() => smStudentCategories.id, { onDelete: "set null", onUpdate: "restrict" }),
    studentGroupId: integer("student_group_id")
      .default(1)
      .references(() => smStudentGroups.id, { onDelete: "set null", onUpdate: "restrict" }),
    classId: integer("class_id")
      .default(1)
      .references(() => smClasses.id, { onDelete: "set null", onUpdate: "restrict" }),
    sectionId: integer("section_id")
      .default(1)
      .references(() => smSections.id, { onDelete: "set null", onUpdate: "restrict" }),
    parentId: integer("parent_id")
      .default(1)
      .references(() => smParents.id, { onDelete: "set null", onUpdate: "restrict" }),
    userId: integer("user_id")
      .default(1)
      .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
    roleId: integer("role_id").references(() => infixRoles.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    genderId: integer("gender_id")
      .default(1)
      .references(() => smBaseSetups.id, { onDelete: "set null", onUpdate: "restrict" }),
    schoolId: integer("school_id")
      .default(1)
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    currentRecordId: integer("current_record_id").references((): AnySQLiteColumn => studentRecords.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    status: text("status", { enum: STUDENT_STATUS }).notNull().default("active")
  },
  (table) => [
    index("sm_students_academic_id_foreign").on(table.academicId),
    index("sm_students_bloodgroup_id_foreign").on(table.bloodgroupId),
    index("sm_students_class_id_foreign").on(table.classId),
    index("sm_students_dormitory_id_foreign").on(table.dormitoryId),
    index("sm_students_gender_id_foreign").on(table.genderId),
    index("sm_students_parent_id_foreign").on(table.parentId),
    index("sm_students_religion_id_foreign").on(table.religionId),
    index("sm_students_role_id_foreign").on(table.roleId),
    index("sm_students_room_id_foreign").on(table.roomId),
    index("sm_students_route_list_id_foreign").on(table.routeListId),
    index("sm_students_school_id_foreign").on(table.schoolId),
    index("sm_students_section_id_foreign").on(table.sectionId),
    index("sm_students_student_category_id_foreign").on(table.studentCategoryId),
    index("sm_students_student_group_id_foreign").on(table.studentGroupId),
    index("sm_students_user_id_foreign").on(table.userId),
    index("sm_students_vechile_id_foreign").on(table.vechileId),
    index("sm_students_school_academic_class_section_index").on(
      table.schoolId,
      table.academicId,
      table.classId,
      table.sectionId
    ),
    statusCheck("sm_students_status_check", table.status, STUDENT_STATUS)
  ]
);

export const studentRecords = sqliteTable(
  "student_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    classId: integer("class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    sectionId: integer("section_id").references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    rollNo: text("roll_no"),
    isPromote: boolean01("is_promote"),
    isDefault: boolean01("is_default"),
    schoolId: integer("school_id")
      .default(1)
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    activeStatus: integer("active_status").default(1),
    ...auditTimestamps(),
    isGraduate: boolean01("is_graduate"),
    status: text("status", { enum: RECORD_STATUS }).notNull().default("current"),
    promotedFromRecordId: integer("promoted_from_record_id").references(
      (): AnySQLiteColumn => studentRecords.id,
      { onDelete: "set null", onUpdate: "restrict" }
    ),
    promotionBatchId: integer("promotion_batch_id")
  },
  (table) => [
    index("student_records_academic_id_foreign").on(table.academicId),
    index("student_records_class_id_foreign").on(table.classId),
    index("student_records_school_id_foreign").on(table.schoolId),
    index("student_records_section_id_foreign").on(table.sectionId),
    index("student_records_student_id_foreign").on(table.studentId),
    index("student_records_school_academic_student_default_index").on(
      table.schoolId,
      table.academicId,
      table.studentId,
      table.isDefault
    ),
    statusCheck("student_records_status_check", table.status, RECORD_STATUS)
  ]
);

export const smStudentPromotions = sqliteTable(
  "sm_student_promotions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    resultStatus: text("result_status"),
    ...auditTimestamps(),
    previousClassId: integer("previous_class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    currentClassId: integer("current_class_id").references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    previousSectionId: integer("previous_section_id").references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    currentSectionId: integer("current_section_id").references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    previousSessionId: integer("previous_session_id").references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    currentSessionId: integer("current_session_id").references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    admissionNumber: integer("admission_number"),
    studentInfo: text("student_info"),
    meritStudentInfo: text("merit_student_info"),
    previousRollNumber: integer("previous_roll_number"),
    currentRollNumber: integer("current_roll_number"),
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
    index("sm_student_promotions_academic_id_foreign").on(table.academicId),
    index("sm_student_promotions_current_class_id_foreign").on(table.currentClassId),
    index("sm_student_promotions_current_section_id_foreign").on(table.currentSectionId),
    index("sm_student_promotions_current_session_id_foreign").on(table.currentSessionId),
    index("sm_student_promotions_previous_class_id_foreign").on(table.previousClassId),
    index("sm_student_promotions_previous_section_id_foreign").on(table.previousSectionId),
    index("sm_student_promotions_previous_session_id_foreign").on(table.previousSessionId),
    index("sm_student_promotions_school_id_foreign").on(table.schoolId),
    index("sm_student_promotions_student_id_foreign").on(table.studentId)
  ]
);

export const smStudentTimelines = sqliteTable(
  "sm_student_timelines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    staffStudentId: integer("staff_student_id").notNull(),
    title: text("title"),
    date: calendarDate("date"),
    description: text("description"),
    file: text("file"),
    type: text("type"),
    visibleToStudent: boolean01("visible_to_student"),
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
    index("sm_student_timelines_academic_id_foreign").on(table.academicId),
    index("sm_student_timelines_school_id_foreign").on(table.schoolId)
  ]
);

export const smStudentGroups = sqliteTable(
  "sm_student_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    group: text("group").notNull(),
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
    index("sm_student_groups_academic_id_foreign").on(table.academicId),
    index("sm_student_groups_school_id_foreign").on(table.schoolId)
  ]
);

export const smRoutes = sqliteTable(
  "sm_routes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    far: moneyMinorUnits("far").notNull(),
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
    index("sm_routes_academic_id_foreign").on(table.academicId),
    index("sm_routes_school_id_foreign").on(table.schoolId)
  ]
);

export const smVehicles = sqliteTable(
  "sm_vehicles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vehicleNo: text("vehicle_no").notNull(),
    vehicleModel: text("vehicle_model").notNull(),
    madeYear: integer("made_year"),
    note: text("note"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    driverId: integer("driver_id"),
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
    index("sm_vehicles_academic_id_foreign").on(table.academicId),
    index("sm_vehicles_school_id_foreign").on(table.schoolId)
  ]
);

export const smDormitoryLists = sqliteTable(
  "sm_dormitory_lists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormitoryName: text("dormitory_name").notNull(),
    type: text("type").notNull(),
    address: text("address"),
    intake: integer("intake"),
    description: text("description"),
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
    index("sm_dormitory_lists_academic_id_foreign").on(table.academicId),
    index("sm_dormitory_lists_school_id_foreign").on(table.schoolId)
  ]
);

export const smRoomLists = sqliteTable(
  "sm_room_lists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    numberOfBed: integer("number_of_bed").notNull(),
    costPerBed: moneyMinorUnits("cost_per_bed"),
    description: text("description"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    dormitoryId: integer("dormitory_id")
      .default(1)
      .references(() => smDormitoryLists.id, { onDelete: "cascade", onUpdate: "restrict" }),
    roomTypeId: integer("room_type_id")
      .default(1)
      .references(() => smRoomTypes.id, { onDelete: "cascade", onUpdate: "restrict" }),
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
    index("sm_room_lists_academic_id_foreign").on(table.academicId),
    index("sm_room_lists_dormitory_id_foreign").on(table.dormitoryId),
    index("sm_room_lists_room_type_id_foreign").on(table.roomTypeId),
    index("sm_room_lists_school_id_foreign").on(table.schoolId)
  ]
);

export const smRoomTypes = sqliteTable(
  "sm_room_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    description: text("description"),
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
    index("sm_room_types_academic_id_foreign").on(table.academicId),
    index("sm_room_types_school_id_foreign").on(table.schoolId)
  ]
);

export const peopleTables = [
  smStaffs,
  smParents,
  smStudents,
  studentRecords,
  smStudentPromotions,
  smStudentTimelines,
  smStudentGroups,
  smRoutes,
  smVehicles,
  smDormitoryLists,
  smRoomLists,
  smRoomTypes
];
