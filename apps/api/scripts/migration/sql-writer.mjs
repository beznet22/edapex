/**
 * Writes the transformed dataset as D1-safe tier files.
 *
 * The caller runs the files with `wrangler d1 execute --local --file`; each file
 * starts with `PRAGMA defer_foreign_keys = on` so the tier's parent-first order
 * is not the only protection against FK checks inside a multi-statement exec.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chunk, insertStatements } from "./sql-literal.mjs";
import { LEGACY_TABLES, TABLE_TIER } from "./tables.mjs";

const RESOLUTION_COLUMNS = [
  "school_id",
  "finding_id",
  "entity",
  "entity_id",
  "before_json",
  "after_json",
  "reason",
  "archive_key",
  "applied_at"
];

export function maxIdOf(rows) {
  let max = 0;
  for (const row of rows) {
    const value = Number(row.id);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}

export function writeTierFiles(result, outDir) {
  mkdirSync(outDir, { recursive: true });
  const files = [];
  const tables = {};
  let currentRecordRows = [];

  for (const table of LEGACY_TABLES) {
    const value = result.tables.get(table);
    if (value === undefined || value.rows.length === 0) continue;
    const tier = TABLE_TIER[table] ?? 0;
    let insertRows = value.rows;
    if (table === "sm_students") {
      currentRecordRows = value.rows.filter(
        (row) => row.current_record_id !== null && row.current_record_id !== undefined
      );
      insertRows = value.rows.map((row) => ({ ...row, current_record_id: null }));
    }
    const statements = [
      "PRAGMA defer_foreign_keys = on;",
      ...insertStatements(table, value.columns, insertRows, 20)
    ];
    const file = path.join(outDir, `tier-${tier}-${table}.sql`);
    writeFileSync(file, `${statements.join("\n\n")}\n`);
    files.push(file);
    tables[table] = { tier, statements: statements.length - 1 };
  }

  // sm_students.current_record_id and student_records.student_id form a cycle.
  // Students load with a null current_record_id; this file runs after student_records.
  if (currentRecordRows.length > 0) {
    const statements = ["PRAGMA defer_foreign_keys = on;"];
    for (const group of chunk(currentRecordRows, 100)) {
      const cases = group
        .map((row) => {
          const id = Number(row.id);
          const recordId = Number(row.current_record_id);
          if (!Number.isInteger(id) || !Number.isInteger(recordId)) {
            throw new Error("Invalid current_record_id update row");
          }
          return `WHEN ${id} THEN ${recordId}`;
        })
        .join(" ");
      const ids = group.map((row) => Number(row.id)).join(", ");
      statements.push(
        `UPDATE sm_students SET current_record_id = CASE id ${cases} END WHERE id IN (${ids});`
      );
    }
    const file = path.join(outDir, "current-records.sql");
    writeFileSync(file, `${statements.join("\n")}\n`);
    files.push(file);
  }

  const resolutionStatements = insertStatements(
    "migration_resolutions",
    RESOLUTION_COLUMNS,
    result.resolutions,
    20
  );
  const resolutionFile = path.join(outDir, "resolutions.sql");
  writeFileSync(
    resolutionFile,
    `${["PRAGMA defer_foreign_keys = on;", ...resolutionStatements].join("\n\n")}\n`
  );
  files.push(resolutionFile);

  const sequenceStatements = ["PRAGMA defer_foreign_keys = on;"];
  const maxIds = {};
  for (const table of LEGACY_TABLES) {
    const value = result.tables.get(table);
    if (value === undefined || value.rows.length === 0) continue;
    if (!value.columns.includes("id")) continue;
    const maxId = maxIdOf(value.rows);
    if (maxId === 0) continue;
    maxIds[table] = maxId;
    sequenceStatements.push(
      `DELETE FROM sqlite_sequence WHERE name = '${table}';`,
      `INSERT INTO sqlite_sequence (name, seq) VALUES ('${table}', ${maxId});`
    );
  }
  const sequenceFile = path.join(outDir, "sequence-fix.sql");
  writeFileSync(sequenceFile, `${sequenceStatements.join("\n")}\n`);
  files.push(sequenceFile);

  return { files, tables, maxIds };
}

export function settlementManifest(result) {
  return Object.fromEntries(
    LEGACY_TABLES.map((table) => {
      const value = result.tables.get(table);
      return [
        table,
        {
          sourceRows: result.sourceRows[table] ?? 0,
          outputRows: value?.rows.length ?? 0
        }
      ];
    })
  );
}
