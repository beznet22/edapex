/**
 * Live-only table profile for the one-window cutover.
 *
 * Historical raw assessment rows and timelines are not loaded into production
 * D1; they are generated as R2 archive objects and served from there. The
 * profile keeps only identity/roster/structure/config plus the FK parents the
 * loaded rows need.
 */

export const HISTORICAL_RAW_TABLES = Object.freeze([
  "sm_mark_stores",
  "sm_result_stores",
  "student_ratings",
  "teacher_remarks",
  "class_attendances",
  "sm_student_attendances",
  "sm_student_timelines"
]);

export const HISTORICAL_CONFIG_TABLES = Object.freeze([
  "sm_exams",
  "sm_exam_setups",
  "sm_exam_schedules",
  "sm_student_promotions"
]);

export const NON_LIVE_TABLES = Object.freeze([
  ...HISTORICAL_RAW_TABLES,
  ...HISTORICAL_CONFIG_TABLES,
  "chat_groups",
  "chat_group_users",
  "sm_bank_accounts",
  "sm_fees_assigns",
  "sm_fees_discounts",
  "sm_fees_groups",
  "sm_fees_masters",
  "sm_fees_payments",
  "sm_fees_types",
  "sm_homework_students",
  "sm_homeworks",
  "sm_events",
  "sm_holidays",
  "sm_notice_boards",
  "sm_class_times",
  "sm_class_routines",
  "sm_class_routine_updates"
]);

/**
 * Tables the live roots need even when no FK points at them.
 * @type {readonly string[]}
 */
export const REQUIRED_LIVE_TABLES = Object.freeze([
  "sm_schools",
  "infix_roles",
  "users",
  "languages",
  "sm_date_formats",
  "sm_base_groups",
  "sm_base_setups",
  "sm_designations",
  "sm_human_departments",
  "sm_class_rooms",
  "sm_academic_years",
  "sm_classes",
  "sm_sections",
  "sm_subjects",
  "sm_student_categories",
  "sm_marks_grades",
  "sm_exam_types",
  "sm_students",
  "student_records",
  "sm_parents",
  "sm_staffs",
  "sm_class_sections",
  "sm_assign_class_teachers",
  "sm_class_teachers",
  "sm_assign_subjects",
  "sm_general_settings",
  "sm_room_types",
  "sm_room_lists",
  "sm_routes",
  "sm_vehicles",
  "sm_dormitory_lists",
  "sm_student_groups"
]);

export const ARCHIVE_METADATA_TABLES = Object.freeze([
  "archive_objects",
  "session_result_summary"
]);

/**
 * Compute the live table set: roots minus excluded tables, required roots, plus
 * the transitive FK parent closure. Historical raw/config tables are never
 * re-added; other excluded lookups are re-added if a live row references them.
 *
 * @param {readonly string[]} allTables
 * @param {ReadonlyMap<string, readonly { column: string, refTable: string, refColumn: string }[]>} foreignKeys
 * @returns {readonly string[]}
 */
export function computeLiveTables(allTables, foreignKeys) {
  const never = new Set([...HISTORICAL_RAW_TABLES, ...HISTORICAL_CONFIG_TABLES]);
  const excluded = new Set(NON_LIVE_TABLES);
  const live = new Set(allTables.filter((table) => !excluded.has(table)));
  for (const table of REQUIRED_LIVE_TABLES) {
    if (allTables.includes(table)) live.add(table);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const table of [...live]) {
      for (const fk of foreignKeys.get(table) ?? []) {
        const parent = fk.refTable;
        if (parent === table) continue;
        if (!allTables.includes(parent) || never.has(parent)) continue;
        if (live.has(parent)) continue;
        live.add(parent);
        changed = true;
      }
    }
  }

  return allTables.filter((table) => live.has(table));
}

/**
 * @param {readonly string[]} allTables
 * @param {ReadonlyMap<string, readonly { column: string, refTable: string, refColumn: string }[]>} foreignKeys
 * @returns {{ live: readonly string[], excluded: readonly string[], archiveMetadata: readonly string[] }}
 */
export function profileTables(allTables, foreignKeys) {
  const live = new Set(computeLiveTables(allTables, foreignKeys));
  return {
    live: [...live],
    excluded: allTables.filter((table) => !live.has(table)),
    archiveMetadata: [...ARCHIVE_METADATA_TABLES]
  };
}
