#!/usr/bin/env node
/**
 * Mirrors the production D1 into the local one, with identities scrubbed.
 *
 * # Why a mirror and not a raw export
 *
 * `wrangler d1 export` produces SQL containing every real child in the school: 900 student
 * names, 494 guardians with phone numbers, 87 staff. Copying that to a laptop moves minors'
 * records out of the environment they are governed by. This copies the same *shape* — every
 * foreign key, every count, every distribution — with names, emails, phones and photos
 * replaced by deterministic placeholders.
 *
 * The point of real data is scale: pagination, search and table density are only testable
 * against hundreds of rows. None of that needs a real name attached.
 *
 *   node services/sms-api/scripts/mirror-remote-d1.mjs
 *   node services/sms-api/scripts/mirror-remote-d1.mjs --raw     # no scrubbing (see below)
 *
 * # What is never copied, even with --raw
 *
 *   auth_sessions      live session tokens
 *   auth_magic_links   live sign-in tokens, some unexpired
 *   auth_codes         live student sign-in codes
 *   auth_rate_limits   per-IP counters with no local meaning
 *   public_document_tokens  unexpired public share tokens
 *
 * Those are credentials, not data. A local database has no use for them and a leaked copy
 * would be usable.
 *
 * # Missing: photos
 *
 * `student_photo` and `staff_photo` become null. The files live in the `edapex-media` R2
 * bucket, which this script does not read, so keeping the paths would render broken images
 * everywhere and hide real layout bugs behind broken-image icons.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = "edapex-recovery";
const RAW = process.argv.includes("--raw");

/** Copied verbatim: reference data with no personal content. */
const VERBATIM = [
  "sm_academic_years",
  "sm_base_groups",
  "sm_base_setups",
  "sm_blood_groups",
  "sm_class_rooms",
  "sm_class_sections",
  "sm_class_times",
  "sm_classes",
  "sm_date_formats",
  "sm_designations",
  "sm_dormitory_lists",
  "sm_exam_types",
  "sm_fees_groups",
  "sm_fees_masters",
  "sm_fees_types",
  "sm_general_settings",
  "sm_holidays",
  "sm_human_departments",
  "sm_languages",
  "sm_marks_grades",
  "sm_room_lists",
  "sm_room_types",
  "sm_routes",
  "sm_sections",
  "sm_sessions",
  "sm_student_categories",
  "sm_student_groups",
  "sm_subjects",
  "sm_vehicles",
  "infix_roles",
  "languages",
  "report_settings"
];

/** Copied with identity columns replaced. */
const SCRUBBED = ["sm_schools", "users", "sm_staffs", "sm_parents", "sm_students", "auth_identities"];

/**
 * Copied as-is: the data the UI needs to render, with no personal content of its own.
 * `sm_students`/`sm_staffs` rows are referenced by these, and the ids are preserved.
 */
const DEPENDENT = [
  "sm_assign_class_teachers",
  "sm_assign_subjects",
  "sm_class_teachers",
  "sm_student_promotions",
  "sm_student_timelines",
  "student_records",
  "promotion_batches",
  "promotion_outcomes",
  "session_result_summary",
  "sm_homeworks",
  "sm_homework_students",
  "sm_mark_stores",
  "sm_result_stores",
  "student_ratings",
  "teacher_remarks",
  "chat_groups",
  "chat_group_users"
];

/** Never copied: credentials and live tokens. */
const NEVER = [
  "auth_sessions",
  "auth_magic_links",
  "auth_codes",
  "auth_rate_limits",
  "auth_events",
  "public_document_tokens",
  "archive_objects",
  "session_jobs",
  "ocr_cache",
  "marksheet_captures",
  "migration_resolutions",
  "d1_migrations"
];

/**
 * Per-table column replacement.
 *
 * Values are functions of the row so a re-run produces the same placeholder — a random value
 * would churn the database on every mirror and make diffs meaningless.
 */
const SCRUB = {
  users: (row) => ({
    full_name: `User ${row.id}`,
    username: `user${row.id}@example.test`,
    /*
     * `KEEP_EMAIL` names one account to leave intact, so the person running the mirror can
     * still sign in. Defaulting to scrubbing everything means a mirror silently locks you out
     * of your own local database, and re-importing afterwards is a step nobody remembers.
     */
    email:
      row.email === null
        ? null
        : process.env.KEEP_EMAIL !== undefined && row.email === process.env.KEEP_EMAIL
          ? row.email
          : `user${row.id}@example.test`,
    phone_number: null,
    password: null,
    random_code: null,
    notification_token: null,
    remember_token: null,
    device_token: null,
    stripe_id: null,
    card_last_four: null
  }),
  sm_staffs: (row) => ({
    first_name: "Staff",
    last_name: `${row.id}`,
    full_name: `Staff ${row.id}`,
    fathers_name: null,
    mothers_name: null,
    email: row.email === null ? null : `staff${row.id}@example.test`,
    mobile: null,
    emergency_mobile: null,
    staff_photo: null,
    current_address: null,
    permanent_address: null,
    bank_account_name: null,
    bank_account_no: null,
    epf_no: null,
    notes: null,
    joining_letter: null,
    resume: null,
    other_document: null
  }),
  sm_parents: (row) => ({
    fathers_name: row.fathers_name === null ? null : `Father ${row.id}`,
    fathers_mobile: null,
    fathers_photo: null,
    mothers_name: row.mothers_name === null ? null : `Mother ${row.id}`,
    mothers_mobile: null,
    mothers_photo: null,
    guardians_name: row.guardians_name === null ? null : `Guardian ${row.id}`,
    guardians_mobile: null,
    guardians_email: row.guardians_email === null ? null : `guardian${row.id}@example.test`,
    guardians_photo: null,
    guardians_address: null
  }),
  sm_students: (row) => ({
    first_name: "Student",
    last_name: `${row.id}`,
    full_name: `Student ${row.id}`,
    email: row.email === null ? null : `student${row.id}@example.test`,
    mobile: null,
    student_photo: null,
    current_address: null,
    permanent_address: null,
    national_id_no: null,
    local_id_no: null,
    bank_account_no: null,
    driver_id: null,
    previous_school_details: null,
    document_file_1: null,
    document_file_2: null,
    document_file_3: null,
    document_file_4: null
  }),
  auth_identities: (row) => ({
    provider_user_id: `scrubbed-${row.id}`,
    email_at_provider:
      row.email_at_provider === null ? null : `identity${row.id}@example.test`
  })
};

/** Statements accumulated for the file write. */
const pendingSql = [];

function queue(statement) {
  pendingSql.push(statement.endsWith(";") ? statement : `${statement};`);
}

/** The local miniflare D1 file for this database. */
function findDatabaseFile() {
  const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  if (files.length === 0) return null;
  // The newest is the one the running `wrangler dev` is using.
  return join(dir, files.sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)[0]);
}

function run(where, statement) {
  const args = ["d1", "execute", DB, where === "remote" ? "--remote" : "--local", "--json", "--command", statement];
  const output = execFileSync("wrangler", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024
  });
  const start = output.indexOf("[");
  if (start < 0) return [];
  return JSON.parse(output.slice(start))?.[0]?.results ?? [];
}

/**
 * Drops list entries that do not exist in the remote schema.
 *
 * The lists above name tables by hand, and a name that looks right but is not in this
 * database ("sm_blood_groups", "sm_sessions") fails the whole run on the first request. The
 * remote schema is the authority, so it is asked once and the lists are intersected with it.
 */
const present = new Set(
  run("remote", "SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name)
);

const keep = (table) => present.has(table);
const VERBATIM_PRESENT = VERBATIM.filter(keep);
const SCRUBBED_PRESENT = SCRUBBED.filter(keep);
const DEPENDENT_PRESENT = DEPENDENT.filter(keep);

const literal = (value) => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  /*
   * Backslashes must be doubled as well as quotes.
   *
   * This database carries Laravel-era values like `App\SmClass,App\SmSection` in
   * `copy_with_academic_year`. Whether a backslash is an escape inside a SQLite string
   * literal depends on how it was compiled, and the Workers engine treats it as one — so an
   * unescaped `\S` makes the literal invalid and the whole batch fails.
   */
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
};

/**
 * Columns dropped during the insert and restored afterwards.
 *
 * `sm_students.current_record_id` and `student_records.student_id` are a cycle: neither
 * table can be inserted first. The migration writer solves it the same way — insert students
 * with a null pointer, then patch it once the records exist.
 */
const DEFERRED_COLUMN = {
  sm_students: { column: "current_record_id", patch: "current-records" }
};

function mirrorTable(table, scrub) {
  const rows = run("remote", `SELECT * FROM ${table}`);
  if (rows.length === 0) {
    console.log(`  ${table}: empty`);
    return 0;
  }

  const allColumns = Object.keys(rows[0]);
  const dormant = DEFERRED_COLUMN[table];
  const columns = dormant === undefined
    ? allColumns
    : allColumns.filter((column) => column !== dormant.column);

  // Batched inserts: one statement per 50 rows keeps each request under D1's size limit
  // without a per-row round trip (which would be ~7,000 requests for this database).
  const CHUNK = 50;
  for (let index = 0; index < rows.length; index += CHUNK) {
    const batch = rows.slice(index, index + CHUNK).map((row) => {
      const overrides = scrub === undefined || RAW ? {} : scrub(row);
      const values = columns.map((column) =>
        literal(column in overrides ? overrides[column] : row[column])
      );
      return `(${values.join(", ")})`;
    });
    queue(
      `INSERT OR REPLACE INTO ${table} (${columns.map((c) => `"${c}"`).join(", ")}) VALUES ${batch.join(", ")}`
    );
  }

  if (dormant !== undefined) {
    const patches = rows
      .filter((row) => row[dormant.column] !== null && row[dormant.column] !== undefined)
      .map((row) => `UPDATE ${table} SET ${dormant.column} = ${Number(row[dormant.column])} WHERE id = ${Number(row.id)};`);
    for (const patch of patches) queue(patch);
    if (patches.length > 0) console.log(`    restored ${patches.length} ${dormant.column}`);
  }

  const note = scrub === undefined || RAW ? "" : " (scrubbed)";
  console.log(`  ${table}: ${rows.length}${note}`);
  return rows.length;
}

/**
 * Clears the local tables before inserting.
 *
 * `INSERT OR REPLACE` alone would leave rows that exist locally but not remotely — including
 * the hand-seeded fixture — so the local database would be a union of two datasets rather
 * than a mirror. Children before parents, or the foreign keys block the deletes.
 */
/*
 * Deletion runs with foreign keys deferred inside one call, in reverse dependency order.
 *
 * Reverse of the insert order means children first, but the schema has cycles, so the
 * pragma is what actually makes this safe. Doing it per table was the original bug: each
 * `DELETE` was its own transaction, so deferral ended before the children were gone and the
 * very first parent delete failed.
 */
const DELETE_ORDER = [...DEPENDENT_PRESENT, ...SCRUBBED_PRESENT, ...VERBATIM_PRESENT].reverse();
const deletes = DELETE_ORDER.map((table) => `DELETE FROM ${table};`);
for (const statement of deletes) queue(statement);

console.log(RAW ? "Mirroring RAW (identities preserved)." : "Mirroring with identities scrubbed.");
let total = 0;
/*
 * Order matters more than the list membership.
 *
 * Almost every table carries `created_by`/`updated_by` pointing at `users`, so the reference
 * tables cannot go first: an academic year with `created_by = 1` fails when user 1 does not
 * exist yet. Users and schools are the two roots, so they are inserted before anything that
 * references them, then the rest follows.
 */
const ORDERED_SCRUBBED = SCRUBBED.filter((table) => SCRUBBED_PRESENT.includes(table));

/*
 * Three phases, in dependency order.
 *
 * 1. Roots that reference nothing: school, roles, academic years, base setups.
 * 2. People, which reference the roots (`users.role_id`, `users.school_id`) and each other
 *    (`sm_students.parent_id`).
 * 3. The remaining reference tables, which people point at but which do not point back.
 *
 * Getting this wrong produces `FOREIGN KEY constraint failed` on the *first* table rather
 * than a useful message, which is why the ordering is explicit rather than a single list.
 */
const PHASE_ONE = [
  "sm_schools",
  "infix_roles",
  "languages",
  "sm_languages",
  "sm_base_groups",
  "sm_student_categories",
  "sm_human_departments",
  "sm_designations",
  "sm_academic_years"
].filter((table) => VERBATIM_PRESENT.includes(table));

for (const table of PHASE_ONE) total += mirrorTable(table);
for (const table of ORDERED_SCRUBBED) total += mirrorTable(table, SCRUB[table]);
for (const table of VERBATIM_PRESENT) {
  if (PHASE_ONE.includes(table)) continue;
  total += mirrorTable(table);
}
for (const table of DEPENDENT_PRESENT) total += mirrorTable(table);

/*
 * Written straight into the local D1 SQLite file.
 *
 * Three routes were tried and rejected:
 *
 *   `wrangler d1 import`   — does not exist in this wrangler version
 *   `d1 execute --file`    — trips a Node 26 file-handle error inside wrangler
 *   `d1 execute --command` — D1 ignores `PRAGMA foreign_keys`, and `defer_foreign_keys` is
 *                            transaction-scoped, so a cycle spanning two calls cannot be
 *                            inserted in any order
 *
 * `node:sqlite` writes the file directly, where a single transaction with foreign keys
 * disabled does exactly what the migration writer does: copy a consistent database, then
 * verify at the end. It is also two orders of magnitude faster than thousands of HTTP calls.
 */
const dbFile = findDatabaseFile();
if (dbFile === null) {
  console.error("Could not find the local D1 file. Run `pnpm dev` once to create it.");
  process.exit(1);
}

const { DatabaseSync } = await import("node:sqlite");
const database = new DatabaseSync(dbFile);

/*
 * Sessions survive the mirror.
 *
 * `DELETE FROM users` cascades to `auth_sessions` (`ON DELETE CASCADE`), so every mirror run
 * silently signed everyone out — which reads as "the session expired" rather than "a script
 * deleted it". The rows are copied aside and restored at the end.
 *
 * They are *not* mirrored from production: a live session token is a credential, and the
 * local database has no business holding production's. Only the local ones are preserved.
 */
const localSessions = (() => {
  try {
    return database.prepare('SELECT * FROM auth_sessions' + String.fromCharCode(59)).all();
  } catch {
    return [];
  }
})();
database.exec("PRAGMA foreign_keys = OFF;");
database.exec("BEGIN;");
for (const statement of pendingSql) database.exec(statement);
database.exec("COMMIT;");

if (localSessions.length > 0 && localSessions[0] !== undefined) {
  const columns = Object.keys(localSessions[0]);
  const insert = database.prepare(
    `INSERT OR REPLACE INTO auth_sessions (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`
  );
  for (const row of localSessions) insert.run(...columns.map((column) => row[column]));
  console.log(`  auth_sessions: ${localSessions.length} local session(s) preserved`);
}

const violations = database.prepare("PRAGMA foreign_key_check").all();
database.close();

if (violations.length > 0) {
  console.error(`\n${violations.length} foreign-key violations after the copy:`);
  for (const row of violations.slice(0, 10)) console.error(" ", JSON.stringify(row));
  process.exit(1);
}

console.log(`${total.toLocaleString()} rows mirrored.`);
console.log(`Skipped (credentials): ${NEVER.join(", ")}`);
console.log("");
console.log("Sign in locally with:");
console.log("  pnpm --dir services/sms-api dev:link <your-email>");
