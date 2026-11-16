#!/usr/bin/env node
/**
 * EdApex schema structure extraction.
 *
 * Enriches the used-table inventory (docs/cloudflare-port/audit/schema-usage.json) with
 * primary keys, declared foreign keys, and Drizzle relations, drawn from two
 * independent authoritative sources:
 *
 *   1. inline `.references(...)` inside sms-schema.ts
 *   2. the `relations()` blocks in sms-relations.ts
 *
 * Using both catches FKs that were declared without a matching relations block
 * (and vice versa). Writes .kimchi/docs/schema-structure.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  columnChunks,
  matchParen,
  parseColumn,
  parseCompositePrimaryKey,
  parseReferences,
  parseTableForeignKeys,
  parseTables
} from "./lib/schema-parse.mjs";

const ROOT = process.cwd();
const SCHEMA_FILE = "src/lib/server/db/sms-schema.ts";
const RELATIONS_FILE = "src/lib/server/db/sms-relations.ts";
const USAGE_FILE = "docs/cloudflare-port/audit/schema-usage.json";
const OUT_FILE = ".kimchi/docs/schema-structure.json";

const schemaSource = readFileSync(join(ROOT, SCHEMA_FILE), "utf8");
const allTables = parseTables(schemaSource);
const used = JSON.parse(readFileSync(join(ROOT, USAGE_FILE), "utf8"));

const dbNameOf = new Map(allTables.map((t) => [t.var, t.dbName]));
const tableByVar = new Map(allTables.map((t) => [t.var, t]));

/** Parse `relations(<owner>, (helpers) => ({ ... }))` blocks. */
function parseRelations(source) {
  const blocks = [];
  const relaRe = /relations\(\s*(\w+)\s*,/g;
  for (const m of source.matchAll(relaRe)) {
    const openParen = source.indexOf("(", m.index);
    const closeParen = matchParen(source, openParen);
    if (closeParen === -1) continue;
    const body = source.slice(openParen + 1, closeParen);
    const links = [];
    for (const link of body.matchAll(/\b(one|many)\(\s*(\w+)/g)) {
      links.push({ related: link[2], cardinality: link[1] });
    }
    blocks.push({ owner: m[1], links });
  }
  return blocks;
}

const relationBlocks = parseRelations(readFileSync(join(ROOT, RELATIONS_FILE), "utf8"));
const relationsByOwner = new Map();
const unmatchedRelationOwners = [];
for (const block of relationBlocks) {
  if (!dbNameOf.has(block.owner)) {
    unmatchedRelationOwners.push(block.owner);
    continue;
  }
  relationsByOwner.set(block.owner, block.links);
}

const entries = used.map((u) => {
  const table = tableByVar.get(u.var);
  if (!table) throw new Error(`${u.var} is in the usage inventory but not the schema`);
  const body = schemaSource.slice(table.bodyStart + 1, table.bodyEnd);
  const chunks = columnChunks(body);
  const columns = chunks.map(parseColumn);
  /** TS property key -> physical column name, for table-level foreignKey() extras. */
  const columnName = new Map(columns.map((c) => [c.key, c.column]));

  const pkFromColumns = chunks
    .filter((c) => c.text.includes(".primaryKey()"))
    .map((c) => parseColumn(c).column);
  const composite = parseCompositePrimaryKey(body);
  const pk = pkFromColumns.length > 0 ? pkFromColumns : composite.flat();
  const pkSource = pkFromColumns.length > 0 ? "column" : composite.length > 0 ? "composite" : "none";

  const fks = [];
  const seenFk = new Set();
  const addFk = (fk) => {
    const key = `${fk.column}|${fk.targetVar}|${fk.targetColumn}`;
    if (seenFk.has(key)) return;
    seenFk.add(key);
    fks.push(fk);
  };

  for (const chunk of chunks) {
    const column = parseColumn(chunk);
    for (const ref of parseReferences(chunk.text)) {
      addFk({
        column: column.column,
        targetVar: ref.targetVar,
        targetTable: dbNameOf.get(ref.targetVar) ?? null,
        targetColumn: ref.targetColumn,
        onDelete: ref.onDelete,
        onUpdate: ref.onUpdate,
        declared: "references",
        targetInCatalog: used.some((x) => x.var === ref.targetVar)
      });
    }
  }

  for (const fk of parseTableForeignKeys(body)) {
    addFk({
      column: columnName.get(fk.column) ?? fk.column,
      targetVar: fk.targetVar,
      targetTable: dbNameOf.get(fk.targetVar) ?? null,
      targetColumn: fk.targetColumn,
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate,
      declared: "foreignKey",
      targetInCatalog: used.some((x) => x.var === fk.targetVar)
    });
  }

  const relations = (relationsByOwner.get(u.var) ?? []).map((l) => ({
    related: l.related,
    relatedTable: dbNameOf.get(l.related) ?? null,
    cardinality: l.cardinality,
    inCatalog: used.some((x) => x.var === l.related)
  }));

  return {
    var: u.var,
    dbName: u.dbName,
    startLine: u.startLine,
    endLine: u.endLine,
    columnCount: columns.length,
    pk,
    pkSource,
    columns,
    fks,
    relations,
    usageSites: u.usageSites
  };
});

mkdirSync(join(ROOT, ".kimchi/docs"), { recursive: true });
writeFileSync(join(ROOT, OUT_FILE), `${JSON.stringify(entries, null, 2)}\n`);

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------
const failures = [];

for (const e of entries) {
  // A table may legitimately declare no PK (legacy InfixEdu drift). Only flag
  // it as a parse failure if the body actually contains a declaration.
  if (e.pk.length === 0) {
    const body = schemaSource.slice(tableByVar.get(e.var).bodyStart, tableByVar.get(e.var).bodyEnd);
    if (/primaryKey/.test(body)) failures.push(`${e.var}: primaryKey present in source but not parsed`);
  }
  if (e.columnCount === 0) failures.push(`${e.var}: no columns parsed`);
  for (const fk of e.fks) {
    if (!fk.targetTable) failures.push(`${e.var}.${fk.column}: unresolved FK target ${fk.targetVar}`);
  }
}

const byVar = new Map(entries.map((e) => [e.var, e]));

const students = byVar.get("smStudents");
if (!students) failures.push("smStudents missing");
else {
  if (students.pk.join(",") !== "id") failures.push(`smStudents pk is ${students.pk.join(",")}, expected id`);
  const targets = new Set(students.fks.map((f) => f.targetTable));
  for (const expected of ["sm_classes", "sm_sections", "sm_parents", "users"]) {
    if (!targets.has(expected)) failures.push(`smStudents missing FK to ${expected}`);
  }
}

const sections = byVar.get("smSections");
if (!sections) failures.push("smSections missing");
else {
  const targets = new Set(sections.fks.map((f) => f.targetTable));
  for (const expected of ["sm_schools", "sm_academic_years"]) {
    if (!targets.has(expected)) failures.push(`smSections missing FK to ${expected}`);
  }
}

const chat = byVar.get("chatGroups");
if (!chat) failures.push("chatGroups missing");
else {
  const targets = new Set(chat.fks.map((f) => f.targetTable));
  for (const expected of ["sm_schools", "sm_academic_years"]) {
    if (!targets.has(expected)) failures.push(`chatGroups missing table-level FK to ${expected}`);
  }
}

if (relationBlocks.length !== 261) failures.push(`expected 261 relations blocks, found ${relationBlocks.length}`);
if (unmatchedRelationOwners.length > 0)
  failures.push(`relations blocks with unknown owner: ${unmatchedRelationOwners.join(", ")}`);

const attachedLinks = entries.reduce((n, e) => n + e.relations.length, 0);

console.log(`used tables: ${entries.length}`);
console.log(`with primary key: ${entries.filter((e) => e.pk.length > 0).length}`);
console.log(`without primary key: ${entries.filter((e) => e.pk.length === 0).map((e) => e.var).join(", ") || "none"}`);
console.log(`total columns: ${entries.reduce((n, e) => n + e.columnCount, 0)}`);
console.log(`declared foreign keys: ${entries.reduce((n, e) => n + e.fks.length, 0)}`);
console.log(`relations blocks: ${relationBlocks.length} (attached links: ${attachedLinks})`);
console.log(`relations blocks with unknown owner: ${unmatchedRelationOwners.length}`);
console.log(`wrote ${OUT_FILE}`);

if (failures.length > 0) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("all invariants passed");
