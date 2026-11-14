#!/usr/bin/env node
/**
 * Transform + load a scratch D1 without running the HTTP rehearsal.
 *
 * Usage:
 *   node scripts/migration/load-cli.mjs --source ../../edapexdb.sql \
 *     --persist .tmp/load-a --out .tmp/load-a/sql \
 *     --digest <64-hex> [--fresh]
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readDump } from "./dump-reader.mjs";
import { applyMigrations, countTable, foreignKeyCheck, loadTierFiles, queryJson, sequenceRows } from "./load.mjs";
import { writeTierFiles } from "./sql-writer.mjs";
import { LEGACY_TABLES } from "./tables.mjs";
import { readTargetModel } from "./target-schema.mjs";
import { transformDump } from "./transform/index.mjs";

const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const source = valueOf("--source", "../../edapexdb.sql");
const persist = path.resolve(valueOf("--persist", ".tmp/load"));
const out = path.resolve(valueOf("--out", path.join(persist, "sql")));
const digest = valueOf("--digest");
const date = valueOf("--date", new Date().toISOString().slice(0, 10));
const from = valueOf("--from");

if (digest === undefined || !/^[0-9a-f]{64}$/i.test(digest)) {
  console.error("usage: node scripts/migration/load-cli.mjs --source <dump> --persist <dir> --digest <64-hex>");
  process.exit(1);
}

if (args.includes("--fresh")) rmSync(persist, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

if (from === undefined || args.includes("--fresh")) {
  console.log("applying migrations");
  applyMigrations(persist);
}

console.log("reading dump");
const dump = await readDump(source, LEGACY_TABLES);
const targetModel = readTargetModel(
  path.resolve(import.meta.dirname, "../../src/lib/server/db/migrations")
);
console.log(`transforming ${LEGACY_TABLES.length} tables`);
const result = transformDump(dump, {
  digest: digest.toLowerCase(),
  now: Math.floor(Date.now() / 1000),
  schoolId: 1,
  currentAcademicId: 4,
  targetAcademicId: 5,
  parentArchiveKey: `migration/parents/removed-${date}.ndjson`,
  sha256: (value) => value.slice(0, 12),
  targetColumns: targetModel.columns,
  foreignKeys: targetModel.foreignKeys,
  notNull: targetModel.notNull
});

const { files, maxIds } = writeTierFiles(result, out);
console.log(`writing ${files.length} SQL file(s)`);
const startIndex = from === undefined ? 0 : files.findIndex((file) => file.endsWith(from));
if (from !== undefined && startIndex < 0) {
  throw new Error(`--from file not found in the generated SQL set: ${from}`);
}
console.log(`loading tiers${from === undefined ? "" : ` from ${from}`}`);
loadTierFiles(persist, files.slice(startIndex));

console.log("checking foreign keys");
const fk = foreignKeyCheck(persist);
if (fk.length > 0) {
  console.error(JSON.stringify(fk.slice(0, 20), null, 2));
  throw new Error(`${fk.length} foreign-key violation(s)`);
}

console.log("checking row counts");
const reconciliation = {};
let mismatches = 0;
for (const table of LEGACY_TABLES) {
  const value = result.tables.get(table);
  const expected = value?.rows.length ?? 0;
  const actual = countTable(persist, table);
  reconciliation[table] = { expected, actual };
  if (expected !== actual) {
    mismatches += 1;
    console.error(`  ${table}: expected ${expected}, got ${actual}`);
  }
}

console.log("checking sqlite_sequence");
const sequences = sequenceRows(persist, Object.keys(maxIds));
const sequenceFailures = [];
for (const [table, maxId] of Object.entries(maxIds)) {
  const seq = sequences.get(table) ?? 0;
  if (seq < maxId) sequenceFailures.push({ table, maxId, seq });
}
if (sequenceFailures.length > 0) {
  console.error(JSON.stringify(sequenceFailures, null, 2));
  throw new Error(`${sequenceFailures.length} sequence table(s) below their max id`);
}

console.log("checking current_record_id");
const expectedCurrent = (result.tables.get("sm_students")?.rows ?? []).filter(
  (row) => row.current_record_id !== null && row.current_record_id !== undefined
).length;
const actualCurrent = Number(
  queryJson(persist, "SELECT COUNT(*) AS count FROM sm_students WHERE current_record_id IS NOT NULL;")[0]
    ?.count ?? 0
);
const orphanCurrent = Number(
  queryJson(
    persist,
    "SELECT COUNT(*) AS count FROM sm_students s LEFT JOIN student_records r ON r.id = s.current_record_id WHERE s.current_record_id IS NOT NULL AND r.id IS NULL;"
  )[0]?.count ?? 0
);
if (actualCurrent !== expectedCurrent || orphanCurrent !== 0) {
  throw new Error(
    `current_record_id mismatch: expected ${expectedCurrent}, got ${actualCurrent}, orphans ${orphanCurrent}`
  );
}

const expectedResolutions = result.resolutions.length;
const actualResolutions = Number(
  queryJson(persist, "SELECT COUNT(*) AS count FROM migration_resolutions;")[0]?.count ?? 0
);
if (expectedResolutions !== actualResolutions) {
  throw new Error(
    `migration_resolutions mismatch: expected ${expectedResolutions}, got ${actualResolutions}`
  );
}

const evidence = {
  source,
  persist,
  out,
  tableCount: LEGACY_TABLES.length,
  rows: Object.values(reconciliation).reduce((sum, row) => sum + row.actual, 0),
  mismatches,
  foreignKeyViolations: fk.length,
  sequences: sequenceFailures.length,
  currentRecordIds: { expected: expectedCurrent, actual: actualCurrent, orphans: orphanCurrent },
  resolutions: { expected: expectedResolutions, actual: actualResolutions },
  reconciliation
};
writeFileSync(path.join(persist, "load-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`loaded ${evidence.rows} rows across ${LEGACY_TABLES.length} tables`);
console.log(`evidence: ${path.join(persist, "load-evidence.json")}`);
if (mismatches > 0) process.exit(1);
