/**
 * Migration transform orchestrator.
 *
 * Pure: the caller supplies the parsed dump, the shared digest, the clock, the
 * optional email-hash function and the archive key. No Node built-ins, so the
 * Workers vitest pool can import this module directly.
 */
import { keyedRows } from "../dump-reader.mjs";
import { EXCLUDED_DATA_TABLES, LEGACY_TABLES } from "../tables.mjs";
import { transformAcademicYears, transformClasses } from "./academic-years.mjs";
import { applySharedDigest } from "./passwords.mjs";
import { transformPeople } from "./people.mjs";
import { transformRecords } from "./records.mjs";
import { transformSettings } from "./settings.mjs";
import { transformTerms } from "./terms.mjs";
import { exportTimelines } from "./timelines.mjs";
import { asInt, asNullableInt, normalizeName } from "./helpers.mjs";

const USER_COLUMNS = [
  "id",
  "full_name",
  "username",
  "phone_number",
  "email",
  "password",
  "usertype",
  "active_status",
  "random_code",
  "notification_token",
  "remember_token",
  "created_at",
  "updated_at",
  "language",
  "style_id",
  "rtl_ltl",
  "selected_session",
  "created_by",
  "updated_by",
  "access_status",
  "school_id",
  "role_id",
  "previous_role_id",
  "is_administrator",
  "email_verified_at",
  "claim_status"
];

const STUDENT_COLUMNS = [
  "id",
  "admission_no",
  "roll_no",
  "first_name",
  "last_name",
  "full_name",
  "date_of_birth",
  "caste",
  "email",
  "mobile",
  "admission_date",
  "student_photo",
  "age",
  "height",
  "weight",
  "current_address",
  "permanent_address",
  "driver_id",
  "national_id_no",
  "local_id_no",
  "bank_account_no",
  "bank_name",
  "previous_school_details",
  "aditional_notes",
  "ifsc_code",
  "document_title_1",
  "document_file_1",
  "document_title_2",
  "document_file_2",
  "document_title_3",
  "document_file_3",
  "document_title_4",
  "document_file_4",
  "active_status",
  "custom_field",
  "custom_field_form_name",
  "created_at",
  "updated_at",
  "bloodgroup_id",
  "religion_id",
  "route_list_id",
  "dormitory_id",
  "vechile_id",
  "room_id",
  "student_category_id",
  "student_group_id",
  "class_id",
  "section_id",
  "parent_id",
  "user_id",
  "role_id",
  "gender_id",
  "school_id",
  "academic_id",
  "current_record_id",
  "status"
];

const RECORD_COLUMNS = [
  "id",
  "class_id",
  "section_id",
  "roll_no",
  "is_promote",
  "is_default",
  "school_id",
  "academic_id",
  "student_id",
  "active_status",
  "created_at",
  "updated_at",
  "is_graduate",
  "status",
  "promoted_from_record_id",
  "promotion_batch_id"
];

const CLASS_COLUMNS = [
  "id",
  "class_name",
  "pass_mark",
  "active_status",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "school_id",
  "academic_id",
  "parent_id",
  "stage",
  "next_class_id",
  "sort_order"
];

const YEAR_COLUMNS = [
  "id",
  "year",
  "title",
  "starting_date",
  "ending_date",
  "copy_with_academic_year",
  "active_status",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "school_id",
  "status",
  "archived_at",
  "archive_manifest_key",
  "copied_from_id"
];

const TERM_COLUMNS = [
  "id",
  "active_status",
  "name",
  "school_id",
  "academic_id",
  "parent_id",
  "sequence",
  "starts_on",
  "ends_on",
  "status",
  "grading",
  "legacy_suffix",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by"
];

const SETTINGS_COLUMNS = [
  "id",
  "school_id",
  "academic_id",
  "session_id",
  "language_id",
  "date_format_id",
  "school_name",
  "phone",
  "email",
  "address",
  "logo",
  "identity",
  "extras"
];

const CLASS_SECTION_COLUMNS = [
  "id",
  "active_status",
  "created_at",
  "updated_at",
  "class_id",
  "section_id",
  "school_id",
  "academic_id",
  "parent_id",
  "staffing_status",
  "staffing_reviewed_at",
  "staffing_reviewed_by"
];

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function emptyTable(columns = []) {
  return { columns, rows: [] };
}

function copyColumns(row, columns) {
  const out = {};
  for (const column of columns) out[column] = row[column] ?? null;
  return out;
}

/**
 * Legacy MySQL uses `0` as "no reference" in nullable FK columns. SQLite has a
 * real FK, so 0 would point at a non-existent row; null it and record the bulk
 * resolution. `school_id` is never nulled; a zero becomes the tenant id.
 */
function sanitizeForeignKeys(tables, options, resolutions) {
  const fkMap = options.foreignKeys;
  const notNullMap = options.notNull;
  if (!(fkMap instanceof Map) || fkMap.size === 0) {
    for (const [table, value] of tables) {
      const counts = new Map();
      for (const row of value.rows) {
        for (const column of value.columns) {
          if (column === "school_id") {
            if (row[column] === 0 || row[column] === null || row[column] === undefined) {
              row[column] = options.schoolId ?? 1;
            }
            continue;
          }
          if (column.endsWith("_id") && row[column] === 0) {
            row[column] = null;
            counts.set(column, (counts.get(column) ?? 0) + 1);
          }
        }
      }
      for (const [column, count] of counts) {
        resolutions.push({
          findingId: "FK0",
          entity: table,
          entityId: null,
          beforeJson: JSON.stringify({ column, value: 0 }),
          afterJson: JSON.stringify({ nulled: count }),
          reason: "ZERO_FK_TO_NULL"
        });
      }
    }
    return;
  }

  const rebuildIds = () =>
    new Map(
      [...tables].map(([name, value]) => [name, new Set(value.rows.map((row) => String(row.id)))])
    );

  // Two passes: dropping a not-null orphan can orphan a dependent row that was
  // already visited in the same pass.
  for (let pass = 0; pass < 2; pass += 1) {
    const ids = rebuildIds();
    let changed = false;
    for (const [table, value] of tables) {
      const fks = fkMap.get(table) ?? [];
      if (fks.length === 0) continue;
      const counts = new Map();
      const dropped = new Set();
      const increment = (column, key) => {
        const entry = counts.get(column) ?? { zero: 0, orphan: 0, dropped: 0 };
        entry[key] += 1;
        counts.set(column, entry);
      };

      for (const row of value.rows) {
        for (const fk of fks) {
          if (fk.refColumn !== "id") continue;
          if (
            fk.column === "school_id" &&
            (row[fk.column] === 0 || row[fk.column] === null || row[fk.column] === undefined)
          ) {
            row[fk.column] = options.schoolId ?? 1;
          }
          const current = row[fk.column];
          if (current === null || current === undefined) continue;
          const refIds = ids.get(fk.refTable);
          if (refIds === undefined) continue;
          const isNotNull = notNullMap?.get(table)?.get(fk.column) === true;
          if (String(current) === "0") {
            if (isNotNull) {
              dropped.add(row);
              increment(fk.column, "dropped");
              changed = true;
              break;
            }
            row[fk.column] = null;
            increment(fk.column, "zero");
            changed = true;
            continue;
          }
          if (!refIds.has(String(current))) {
            if (isNotNull) {
              dropped.add(row);
              increment(fk.column, "dropped");
              changed = true;
              break;
            }
            row[fk.column] = null;
            increment(fk.column, "orphan");
            changed = true;
          }
        }
      }

      if (dropped.size > 0) value.rows = value.rows.filter((row) => !dropped.has(row));
      for (const [column, entry] of counts) {
        resolutions.push({
          findingId: "FK",
          entity: table,
          entityId: null,
          beforeJson: JSON.stringify({ column }),
          afterJson: JSON.stringify(entry),
          reason:
            entry.dropped > 0
              ? "ORPHAN_FK_ROW_DROPPED"
              : entry.orphan > 0
                ? "ORPHAN_FK_TO_NULL"
                : "ZERO_FK_TO_NULL"
        });
      }
    }
    if (!changed) break;
  }
}

function photoReferences(students) {
  const refs = new Map();
  for (const student of students) {
    const raw = String(student.student_photo ?? "").trim();
    if (raw.length === 0) continue;
    const normalized = raw.startsWith("/") ? raw : `/${raw}`;
    const file = normalized.split("/").pop() ?? normalized;
    const dot = file.lastIndexOf(".");
    const extension = dot >= 0 ? file.slice(dot).toLowerCase() : "";
    const kind = !normalized.startsWith("/uploads/students/")
      ? "NOT_STUDENT_PHOTO"
      : extension === ".pdf"
        ? "PDF_NOT_PHOTO"
        : IMAGE_EXTENSIONS.has(extension)
          ? "IMAGE"
          : "UNSUPPORTED_EXTENSION";
    const existing = refs.get(normalized);
    if (existing === undefined) {
      refs.set(normalized, {
        url: normalized,
        file,
        extension,
        kind,
        studentIds: [asInt(student.id)],
        references: 1
      });
    } else {
      existing.studentIds.push(asInt(student.id));
      existing.references += 1;
    }
  }
  return [...refs.values()];
}

function transformChatGroups(rows, memberships) {
  const resolutions = [];
  const used = new Set();
  const idMap = new Map();
  const output = rows.map((row, index) => {
    const original = row.id === null || row.id === undefined ? null : String(row.id);
    let id = original;
    if (id === null || id.length === 0 || used.has(id)) {
      id = `cg_${index + 1}`;
      resolutions.push({
        findingId: "CHAT_GROUP",
        entity: "chat_groups",
        entityId: String(row.id ?? `row-${index + 1}`),
        beforeJson: JSON.stringify({ id: original }),
        afterJson: JSON.stringify({ id }),
        reason: "CHAT_GROUP_ID_GENERATED"
      });
    }
    used.add(id);
    if (original !== null) idMap.set(original, idMap.get(original) ?? id);
    return { ...row, id };
  });

  const membershipRows = [];
  for (const row of memberships) {
    const original = row.group_id === null || row.group_id === undefined ? null : String(row.group_id);
    const mapped = original === null ? null : idMap.get(original) ?? original;
    if (mapped === null) {
      resolutions.push({
        findingId: "CHAT_GROUP",
        entity: "chat_group_users",
        entityId: String(row.id ?? "unknown"),
        beforeJson: JSON.stringify({ group_id: original }),
        afterJson: null,
        reason: "CHAT_GROUP_MEMBERSHIP_DROPPED"
      });
      continue;
    }
    membershipRows.push({ ...row, group_id: mapped });
  }

  return { rows: output, membershipRows, resolutions };
}

export function transformDump(dump, options) {
  const table = (name) => keyedRows(dump.tables.get(name));
  const tables = new Map();
  const resolutions = [];

  const usersSource = table("users");
  const parentsSource = table("sm_parents");
  const studentsSource = table("sm_students");
  const staffsSource = table("sm_staffs");
  const recordsSource = table("student_records");
  const yearsSource = table("sm_academic_years");
  const classesSource = table("sm_classes");
  const termsSource = table("sm_exam_types");
  const settingsSource = table("sm_general_settings");
  const classSectionsSource = table("sm_class_sections");
  const timelineSource = table("sm_student_timelines");
  const chatGroupsSource = table("chat_groups");
  const chatMembersSource = table("chat_group_users");
  const roles = table("infix_roles");

  const passwordResult = applySharedDigest(usersSource, options.digest);
  const years = transformAcademicYears(yearsSource, options);
  const classResult = transformClasses(classesSource, options);
  const termResult = transformTerms(termsSource);
  const recordResult = transformRecords(studentsSource, recordsSource, options);
  const peopleResult = transformPeople({
    users: passwordResult.users,
    parents: parentsSource,
    students: recordResult.students,
    staffs: staffsSource,
    options: { ...options, roles }
  });
  const settings = transformSettings(settingsSource);
  const timelines = exportTimelines(timelineSource);
  const chat = transformChatGroups(chatGroupsSource, chatMembersSource);
  const photos = photoReferences(recordResult.students);

  resolutions.push(
    ...classResult.resolutions,
    ...termResult.resolutions,
    ...recordResult.resolutions,
    ...peopleResult.resolutions,
    ...chat.resolutions
  );

  const target = options.targetColumns instanceof Map ? options.targetColumns : new Map();
  const targetColumns = (name) => {
    const columns = target.get(name);
    return Array.isArray(columns) && columns.length > 0 ? [...columns] : null;
  };
  const columnsFor = (name, fallback) => targetColumns(name) ?? fallback;

  tables.set("users", { columns: columnsFor("users", USER_COLUMNS), rows: peopleResult.users });
  tables.set("sm_parents", {
    columns: columnsFor("sm_parents", dump.tables.get("sm_parents")?.columns ?? []),
    rows: peopleResult.parents
  });
  tables.set("sm_students", {
    columns: columnsFor("sm_students", STUDENT_COLUMNS),
    rows: recordResult.students
  });
  tables.set("student_records", {
    columns: columnsFor("student_records", RECORD_COLUMNS),
    rows: recordResult.records
  });
  tables.set("sm_academic_years", {
    columns: columnsFor("sm_academic_years", YEAR_COLUMNS),
    rows: years
  });
  tables.set("sm_classes", { columns: columnsFor("sm_classes", CLASS_COLUMNS), rows: classResult.rows });
  tables.set("sm_exam_types", {
    columns: columnsFor("sm_exam_types", TERM_COLUMNS),
    rows: termResult.rows
  });
  tables.set("sm_general_settings", {
    columns: columnsFor("sm_general_settings", SETTINGS_COLUMNS),
    rows: settings
  });
  tables.set("sm_class_sections", {
    columns: columnsFor("sm_class_sections", CLASS_SECTION_COLUMNS),
    rows: classSectionsSource.map((row) => ({
      ...row,
      staffing_status: "pending",
      staffing_reviewed_at: null,
      staffing_reviewed_by: null
    }))
  });
  tables.set("chat_groups", {
    columns: columnsFor("chat_groups", dump.tables.get("chat_groups")?.columns ?? []),
    rows: chat.rows
  });
  tables.set("chat_group_users", {
    columns: columnsFor("chat_group_users", dump.tables.get("chat_group_users")?.columns ?? []),
    rows: chat.membershipRows
  });

  for (const tableName of LEGACY_TABLES) {
    if (tables.has(tableName)) continue;
    if (EXCLUDED_DATA_TABLES.includes(tableName)) {
      tables.set(
        tableName,
        emptyTable(columnsFor(tableName, dump.tables.get(tableName)?.columns ?? []))
      );
      continue;
    }
    const source = dump.tables.get(tableName);
    if (source === undefined) {
      tables.set(tableName, emptyTable());
      continue;
    }
    const columns = columnsFor(tableName, [...source.columns]);
    const rows = table(tableName).map((row) => copyColumns(row, columns));
    tables.set(tableName, { columns, rows });
  }

  const findings = {
    ...recordResult.findings,
    ...peopleResult.findings,
    TERM: termResult.rows.length,
    SETTINGS: settings.length,
    PASSWORDS: passwordResult.replaced,
    PHOTOS: photos.length
  };

  const appliedAt = options.now;
  const schoolId = options.schoolId ?? 1;
  sanitizeForeignKeys(tables, options, resolutions);
  const normalisedResolutions = resolutions.map((row) => ({
    school_id: schoolId,
    finding_id: row.findingId,
    entity: row.entity,
    entity_id: row.entityId ?? null,
    before_json: row.beforeJson ?? null,
    after_json: row.afterJson ?? null,
    reason: row.reason ?? null,
    archive_key: row.archiveKey ?? null,
    applied_at: appliedAt
  }));

  return {
    tables,
    resolutions: normalisedResolutions,
    findings,
    stats: {
      backfilled: recordResult.stats.backfilled,
      academicDisagreements: recordResult.stats.academicDisagreements,
      removedParents: peopleResult.removedParents.length,
      deactivatedUsers: peopleResult.deactivatedUsers.length,
      timelines: timelines.exports.length,
      photos: photos.length
    },
    removedParents: peopleResult.removedParents,
    deactivatedUsers: peopleResult.deactivatedUsers,
    timelines,
    photos,
    sourceRows: Object.fromEntries(
      LEGACY_TABLES.map((name) => [name, dump.tables.get(name)?.rows.length ?? 0])
    ),
    outputRows: Object.fromEntries(
      [...tables.entries()].map(([name, value]) => [name, value.rows.length])
    )
  };
}

export { normalizeName, asNullableInt };
