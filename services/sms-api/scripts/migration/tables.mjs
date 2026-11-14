/**
 * The 62 ported legacy tables in FK-safe load order.
 *
 * Authority: `docs/cloudflare-port/audit/migration-order.md` and
 * `tests/fixtures/schema-expectations.ts` (`LEGACY_TABLES`). `check-migration-rules.mjs`
 * fails the build when this list and the generated fixture disagree.
 *
 * `exam_merit_positions` and `sm_student_timelines` are legacy tables that exist in
 * the target schema but carry no live rows: the first is re-derived (`05 §2`), the
 * second is exported to R2 and excluded from the live load.
 */

export const EXCLUDED_DATA_TABLES = Object.freeze([
  "exam_merit_positions",
  "sm_student_timelines"
]);

export const TIER_0 = ["chat_group_users", "exam_merit_positions", "sm_schools"];

export const TIER_1 = [
  "infix_roles",
  "users",
  "languages",
  "sm_academic_years",
  "sm_base_groups",
  "sm_date_formats",
  "sm_designations",
  "sm_human_departments"
];

export const TIER_2 = [
  "sm_bank_accounts",
  "sm_base_setups",
  "sm_class_rooms",
  "sm_class_times",
  "sm_classes",
  "sm_dormitory_lists",
  "sm_events",
  "sm_exam_types",
  "sm_fees_discounts",
  "sm_fees_groups",
  "sm_holidays",
  "sm_languages",
  "sm_marks_grades",
  "sm_notice_boards",
  "sm_room_types",
  "sm_routes",
  "sm_sections",
  "sm_student_categories",
  "sm_student_groups",
  "sm_student_timelines",
  "sm_subjects",
  "sm_vehicles"
];

export const TIER_3 = [
  "sm_assign_class_teachers",
  "sm_class_routines",
  "sm_class_sections",
  "sm_exams",
  "sm_fees_types",
  "sm_general_settings",
  "sm_homeworks",
  "sm_parents",
  "sm_room_lists",
  "sm_staffs"
];

export const TIER_4 = [
  "chat_groups",
  "sm_assign_subjects",
  "sm_class_routine_updates",
  "sm_class_teachers",
  "sm_exam_schedules",
  "sm_exam_setups",
  "sm_fees_masters",
  "sm_students"
];

export const TIER_5 = [
  "class_attendances",
  "sm_fees_assigns",
  "sm_homework_students",
  "sm_student_attendances",
  "sm_student_promotions",
  "student_ratings",
  "student_records",
  "teacher_remarks"
];

export const TIER_6 = ["sm_fees_payments", "sm_mark_stores", "sm_result_stores"];

export const TIERS = Object.freeze([TIER_0, TIER_1, TIER_2, TIER_3, TIER_4, TIER_5, TIER_6]);

export const LEGACY_TABLES = Object.freeze(TIERS.flat());

/** Table -> load tier (0-6). */
export const TABLE_TIER = Object.freeze(
  Object.fromEntries(TIERS.flatMap((tables, tier) => tables.map((table) => [table, tier])))
);

/** Tables that are pure reference/config and may be copied into a new session. */
export const CONFIG_TABLES = Object.freeze([
  "sm_sections",
  "sm_class_sections",
  "sm_subjects",
  "sm_assign_subjects",
  "sm_assign_class_teachers",
  "sm_class_teachers",
  "sm_class_routines",
  "sm_marks_grades",
  "sm_student_categories",
  "sm_fees_groups",
  "sm_fees_types",
  "sm_fees_masters",
  "sm_fees_discounts"
]);

/** The eleven source-year classes that form the 2026/27 ladder (ids 12-22). */
export const LADDER = Object.freeze([
  { sourceName: "CRECHE", targetName: "CRECHE", stage: "EARLY_YEARS", sortOrder: 12 },
  { sourceName: "NURSERY 1", targetName: "NURSERY 1", stage: "EARLY_YEARS", sortOrder: 13 },
  { sourceName: "NURSERY 2", targetName: "NURSERY 2", stage: "EARLY_YEARS", sortOrder: 14 },
  { sourceName: "GRADE K", targetName: "GRADE K", stage: "EARLY_YEARS", sortOrder: 15 },
  { sourceName: "DAYCARE", targetName: "DAYCARE", stage: "EARLY_YEARS", sortOrder: 16 },
  { sourceName: "LOWER BASIC 1", targetName: "LOWER BASIC 1", stage: "LOWER_BASIC", sortOrder: 17 },
  { sourceName: "LOWER BASIC 2", targetName: "LOWER BASIC 2", stage: "LOWER_BASIC", sortOrder: 18 },
  { sourceName: "LOWER BASIC 3", targetName: "LOWER BASIC 3", stage: "LOWER_BASIC", sortOrder: 19 },
  { sourceName: "MIDDLE BASIC 4", targetName: "MIDDLE BASIC 4", stage: "MIDDLE_BASIC", sortOrder: 20 },
  { sourceName: "MIDDLE BASIC 5", targetName: "MIDDLE BASIC 5", stage: "MIDDLE_BASIC", sortOrder: 21 },
  { sourceName: "MIDDLE BASIC 6", targetName: "MIDDLE BASIC 6", stage: "MIDDLE_BASIC", sortOrder: 22 }
]);

/** The three new classes the bootstrap adds; ids are allocated at runtime. */
export const UPPER_BASIC_CLASSES = Object.freeze([
  { name: "UPPER BASIC 1", stage: "UPPER_BASIC", sortOrder: 23 },
  { name: "UPPER BASIC 2", stage: "UPPER_BASIC", sortOrder: 24 },
  { name: "UPPER BASIC 3", stage: "UPPER_BASIC", sortOrder: 25 }
]);
