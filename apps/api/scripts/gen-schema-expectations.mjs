#!/usr/bin/env node
/**
 * Generates `tests/fixtures/schema-expectations.ts` from the measured inventory.
 *
 * Input : docs/cloudflare-port/audit/db-inventory.json (read-only artifact)
 * Output: apps/api/tests/fixtures/schema-expectations.ts (committed fixture)
 *
 * Transform rules applied here, and nowhere else:
 *   - `sm_students_session_id_foreign` and `student_records_session_id_foreign`
 *     index columns that 05 §4 drops, so they are not recovered.
 *   - 01a O11 adds two indexes to `chat_group_users`, which had none.
 *   - 05 §4.1/§4.2 add three unique indexes on legacy tables.
 * Every other index is recovered verbatim: same name, same column order.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const INVENTORY = path.resolve(ROOT, "..", "..", "docs", "cloudflare-port", "audit", "db-inventory.json");
const OUT = path.join(ROOT, "tests", "fixtures", "schema-expectations.ts");

/** Columns dropped by 05 §4; the indexes on them cannot be recovered. */
const DROPPED_INDEXES = new Set([
  "sm_students_session_id_foreign",
  "student_records_session_id_foreign"
]);

/** 01a O11 requires two indexes the legacy database never declared. */
const ADDED_LEGACY_INDEXES = {
  chat_group_users: [
    { name: "chat_group_users_group_id_user_id_index", unique: false, columns: ["group_id", "user_id"] },
    { name: "chat_group_users_user_id_index", unique: false, columns: ["user_id"] }
  ]
};

/** 05 §4.1, §4.2, §6 and 04 §9 mandate indexes the legacy database never declared. */
const REDESIGN_EXTRA_INDEXES = [
  {
    table: "sm_academic_years",
    name: "sm_academic_years_school_year_unique",
    unique: true,
    columns: ["school_id", "year"]
  },
  {
    table: "users",
    name: "users_email_index",
    unique: false,
    columns: ["email"]
  },
  {
    table: "sm_exam_types",
    name: "sm_exam_types_academic_id_sequence_unique",
    unique: true,
    columns: ["academic_id", "sequence"]
  },
  {
    table: "sm_exam_types",
    name: "sm_exam_types_academic_id_name_unique",
    unique: true,
    columns: ["academic_id", "name"]
  },
  {
    table: "sm_exams",
    name: "sm_exams_school_academic_term_class_section_subject_unique",
    unique: true,
    columns: ["school_id", "academic_id", "exam_type_id", "class_id", "section_id", "subject_id"]
  }
];

const NEW_TABLES = [
  "auth_identities",
  "auth_magic_links",
  "auth_codes",
  "auth_sessions",
  "auth_events",
  "auth_rate_limits",
  "promotion_batches",
  "promotion_outcomes",
  "migration_resolutions",
  "session_jobs",
  "archive_objects",
  "session_result_summary",
  "report_settings",
  "ocr_cache",
  "marksheet_captures"
];

const NEW_TABLE_INDEXES = {
  auth_identities: [
    { name: "auth_identities_provider_provider_user_id_unique", unique: true, columns: ["provider", "provider_user_id"] },
    { name: "auth_identities_user_id_index", unique: false, columns: ["user_id"] }
  ],
  auth_magic_links: [
    { name: "auth_magic_links_token_hash_unique", unique: true, columns: ["token_hash"] },
    { name: "auth_magic_links_email_created_at_index", unique: false, columns: ["email", "created_at"] }
  ],
  auth_codes: [
    { name: "auth_codes_code_hash_unique", unique: true, columns: ["code_hash"] },
    { name: "auth_codes_subject_type_subject_id_index", unique: false, columns: ["subject_type", "subject_id"] }
  ],
  auth_sessions: [
    { name: "auth_sessions_token_hash_unique", unique: true, columns: ["token_hash"] },
    { name: "auth_sessions_user_id_expires_at_index", unique: false, columns: ["user_id", "expires_at"] }
  ],
  auth_events: [
    { name: "auth_events_user_id_created_at_index", unique: false, columns: ["user_id", "created_at"] },
    { name: "auth_events_type_created_at_index", unique: false, columns: ["type", "created_at"] }
  ],
  auth_rate_limits: [],
  promotion_batches: [
    { name: "promotion_batches_school_academic_index", unique: false, columns: ["school_id", "academic_id"] }
  ],
  promotion_outcomes: [
    { name: "promotion_outcomes_batch_index", unique: false, columns: ["batch_id"] },
    { name: "promotion_outcomes_student_index", unique: false, columns: ["student_id"] }
  ],
  migration_resolutions: [
    { name: "migration_resolutions_school_finding_index", unique: false, columns: ["school_id", "finding_id"] }
  ],
  session_jobs: [
    { name: "session_jobs_school_kind_status_index", unique: false, columns: ["school_id", "kind", "status"] }
  ],
  archive_objects: [
    { name: "archive_objects_object_key_unique", unique: true, columns: ["object_key"] },
    { name: "archive_objects_school_academic_student_unique", unique: true, columns: ["school_id", "academic_id", "student_id"] }
  ],
  session_result_summary: [
    { name: "session_result_summary_term_unique", unique: true, columns: ["school_id", "academic_id", "student_id", "term_id"] },
    { name: "session_result_summary_student_index", unique: false, columns: ["school_id", "student_id"] }
  ],
  report_settings: [],
  ocr_cache: [
    { name: "ocr_cache_expires_at_index", unique: false, columns: ["expires_at"] }
  ],
  marksheet_captures: [
    { name: "marksheet_captures_school_status_index", unique: false, columns: ["school_id", "status"] },
    { name: "marksheet_captures_class_exam_index", unique: false, columns: ["school_id", "class_id", "section_id", "exam_type_id"] },
    { name: "marksheet_captures_ocr_index", unique: false, columns: ["school_id", "ocr_content_sha256", "ocr_parser_version"] },
    { name: "marksheet_captures_student_exam_index", unique: false, columns: ["school_id", "student_id", "exam_type_id"] },
    { name: "marksheet_captures_student_exam_unique", unique: true, columns: ["school_id", "student_id", "exam_type_id"] },
    { name: "marksheet_captures_file_unique", unique: true, columns: ["school_id", "class_id", "section_id", "exam_type_id", "ocr_content_sha256", "ocr_parser_version"] }
  ]
};

const inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
if (!Array.isArray(inventory.tables)) throw new Error("inventory has no tables array");

const legacyTables = [];
const legacyIndexes = {};
let recovered = 0;

for (const table of inventory.tables) {
  const name = table.dbName;
  legacyTables.push(name);
  const kept = table.dbIndexes
    .filter((index) => !DROPPED_INDEXES.has(index.name))
    .map((index) => ({ name: index.name, unique: index.unique === true, columns: index.columns }));
  const added = ADDED_LEGACY_INDEXES[name] ?? [];
  legacyIndexes[name] = [...kept, ...added];
  recovered += kept.length + added.length;
}

const specUniques = REDESIGN_EXTRA_INDEXES;

const legacySecondary = recovered + specUniques.length;
const newTableIndexCount = Object.values(NEW_TABLE_INDEXES).reduce((total, list) => total + list.length, 0);

legacyTables.sort((a, b) => a.localeCompare(b));

const header = `// Generated by apps/api/scripts/gen-schema-expectations.mjs — do not edit by hand.
// Source: docs/cloudflare-port/audit/db-inventory.json plus the 01a O11 and 05 §4 additions.

export interface IndexExpectation {
  readonly name: string;
  readonly unique: boolean;
  readonly columns: readonly string[];
}

export interface TableIndexExpectation extends IndexExpectation {
  readonly table: string;
}

`;

const body = `export const RECOVERED_INDEX_TOTAL = ${recovered};
export const SPEC_EXTRA_TOTAL = ${specUniques.length};
export const LEGACY_INDEX_TOTAL = ${legacySecondary};
export const NEW_TABLE_INDEX_TOTAL = ${newTableIndexCount};

export const LEGACY_TABLES: readonly string[] = ${JSON.stringify(legacyTables, null, 2)};

export const LEGACY_INDEXES: Readonly<Record<string, readonly IndexExpectation[]>> = ${JSON.stringify(legacyIndexes, null, 2)};

export const REDESIGN_EXTRA_INDEXES: readonly TableIndexExpectation[] = ${JSON.stringify(specUniques, null, 2)};

export const NEW_TABLES: readonly string[] = ${JSON.stringify(NEW_TABLES, null, 2)};

export const NEW_TABLE_INDEXES: Readonly<Record<string, readonly IndexExpectation[]>> = ${JSON.stringify(NEW_TABLE_INDEXES, null, 2)};

export const ALL_TABLES: readonly string[] = [...LEGACY_TABLES, ...NEW_TABLES];
`;

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${header}${body}`, "utf8");

console.log(`legacy tables: ${legacyTables.length}`);
console.log(`recovered indexes: ${recovered}`);
console.log(`spec extra indexes: ${specUniques.length}`);
console.log(`legacy secondary indexes: ${legacySecondary}`);
console.log(`new tables: ${NEW_TABLES.length}`);
console.log(`new table indexes: ${newTableIndexCount}`);
console.log(`written: ${path.relative(ROOT, OUT)}`);

if (legacyTables.length !== 62) throw new Error(`expected 62 legacy tables, found ${legacyTables.length}`);
if (recovered !== 226) throw new Error(`expected 226 recovered indexes, found ${recovered}`);
if (legacySecondary !== 231) throw new Error(`expected 231 legacy secondary indexes, found ${legacySecondary}`);
if (NEW_TABLES.length !== 15) throw new Error(`expected 15 new tables, found ${NEW_TABLES.length}`);
