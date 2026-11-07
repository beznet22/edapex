/**
 * Target-schema model read from the generated migrations.
 *
 * The source dump and the target schema do not have identical columns, and D1
 * enforces every foreign key (including the legacy audit FKs). This module
 * returns the insertable columns, the FK graph and not-null flags so the
 * transform can filter, null or quarantine a row before any SQL runs.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CREATE_RE = /^CREATE TABLE `([^`]+)` \(/;
const COLUMN_RE = /^\s*`([^`]+)`\s+([^,]+)/;
const ALTER_RE = /^ALTER TABLE `([^`]+)` ADD `([^`]+)`\s+([^;]+);/;
const FOREIGN_KEY_RE = /FOREIGN KEY \(`([^`]+)`\) REFERENCES `([^`]+)`\(`([^`]+)`\)/;

export function readTargetModel(migrationsDir) {
  const columns = new Map();
  const foreignKeys = new Map();
  const notNull = new Map();

  const columnState = (table) => {
    if (!columns.has(table)) columns.set(table, []);
    if (!notNull.has(table)) notNull.set(table, new Map());
    if (!foreignKeys.has(table)) foreignKeys.set(table, []);
    return {
      columns: columns.get(table),
      notNull: notNull.get(table),
      foreignKeys: foreignKeys.get(table)
    };
  };

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const lines = readFileSync(path.join(migrationsDir, file), "utf8").split("\n");
    let current = null;
    for (const line of lines) {
      const create = CREATE_RE.exec(line);
      if (create !== null) {
        current = create[1];
        columnState(current);
        continue;
      }
      if (current !== null) {
        if (line.startsWith(")")) {
          current = null;
          continue;
        }
        const state = columnState(current);
        const column = COLUMN_RE.exec(line);
        if (column !== null) {
          if (!state.columns.includes(column[1])) state.columns.push(column[1]);
          state.notNull.set(column[1], /\bNOT NULL\b/i.test(column[2]));
          continue;
        }
        const fk = FOREIGN_KEY_RE.exec(line);
        if (fk !== null) {
          state.foreignKeys.push({
            column: fk[1],
            refTable: fk[2],
            refColumn: fk[3]
          });
        }
        continue;
      }
      const alter = ALTER_RE.exec(line);
      if (alter !== null) {
        const state = columnState(alter[1]);
        if (!state.columns.includes(alter[2])) state.columns.push(alter[2]);
        state.notNull.set(alter[2], /\bNOT NULL\b/i.test(alter[3]));
      }
    }
  }

  return { columns, foreignKeys, notNull };
}

export function readTargetSchema(migrationsDir) {
  return readTargetModel(migrationsDir).columns;
}
