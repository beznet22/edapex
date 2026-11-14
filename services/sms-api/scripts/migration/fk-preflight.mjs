#!/usr/bin/env node
/**
 * In-memory FK and column preflight for the transformed dataset.
 *
 * D1 enforces every foreign key, including the legacy audit FKs the migration
 * order document excludes. Running this before `wrangler d1 execute` turns a
 * 90-second failed load into a five-second report.
 */
import path from "node:path";

import { readDump } from "./dump-reader.mjs";
import { LEGACY_TABLES } from "./tables.mjs";
import { readTargetModel } from "./target-schema.mjs";
import { transformDump } from "./transform/index.mjs";

const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const source = valueOf("--source", "../../edapexdb.sql");
const digest = valueOf("--digest", "a".repeat(64));

const targetModel = readTargetModel(
  path.resolve(import.meta.dirname, "../../src/lib/server/db/migrations")
);
const dump = await readDump(source, LEGACY_TABLES);
const result = transformDump(dump, {
  digest,
  now: 1_700_000_000,
  schoolId: 1,
  currentAcademicId: 4,
  targetAcademicId: 5,
  parentArchiveKey: "migration/parents/removed-preflight.ndjson",
  sha256: (value) => value.slice(0, 12),
  targetColumns: targetModel.columns,
  foreignKeys: targetModel.foreignKeys,
  notNull: targetModel.notNull
});

const ids = new Map(
  [...result.tables].map(([name, value]) => [name, new Set(value.rows.map((row) => String(row.id)))])
);
const violations = [];
const unknownColumns = [];

for (const [table, value] of result.tables) {
  const targetColumns = targetModel.columns.get(table);
  if (targetColumns !== undefined) {
    for (const column of value.columns) {
      if (!targetColumns.includes(column)) unknownColumns.push(`${table}.${column}`);
    }
  }
  for (const fk of targetModel.foreignKeys.get(table) ?? []) {
    if (fk.refColumn !== "id") continue;
    // Loaded with a null value, then applied by current-records.sql after records.
    if (table === "sm_students" && fk.column === "current_record_id") continue;
    const refIds = ids.get(fk.refTable);
    if (refIds === undefined) continue;
    for (const row of value.rows) {
      const current = row[fk.column];
      if (current === null || current === undefined) continue;
      if (!refIds.has(String(current))) {
        violations.push({
          table,
          rowId: row.id,
          column: fk.column,
          value: current,
          refTable: fk.refTable
        });
      }
    }
  }
}

const fkResolutions = result.resolutions.filter((row) =>
  String(row.reason).includes("FK")
);

console.log(`tables: ${result.tables.size}`);
console.log(`rows: ${[...result.tables.values()].reduce((sum, value) => sum + value.rows.length, 0)}`);
console.log(`fk resolutions: ${fkResolutions.length}`);
for (const row of fkResolutions.slice(0, 20)) {
  console.log(`  ${row.entity} ${row.reason} ${row.after_json}`);
}
console.log(`unknown columns: ${unknownColumns.length}`);
for (const column of unknownColumns.slice(0, 20)) console.log(`  ${column}`);
console.log(`fk violations: ${violations.length}`);
for (const violation of violations.slice(0, 20)) console.log(`  ${JSON.stringify(violation)}`);

if (violations.length > 0 || unknownColumns.length > 0) process.exit(1);
