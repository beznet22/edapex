#!/usr/bin/env node
/**
 * EdApex schema usage audit.
 *
 * Answers one question: which tables declared in
 * src/lib/server/db/sms-schema.ts are actually imported or referenced by
 * application code under src/?
 *
 * The schema layer itself (sms-schema.ts, db/schema.ts, sms-relations.ts) is
 * excluded as a usage source — sms-relations.ts imports all 261 related tables
 * and db/schema.ts re-exports the entire module, so counting them as consumers
 * would mark every table as "used" and defeat the audit.
 *
 * Writes docs/cloudflare-port/audit/schema-usage.json and exits non-zero if any invariant
 * described in the plan's Chunk 1 acceptance criteria is violated.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  DYNAMIC_RE,
  IMPORT_RE,
  SCHEMA_LAYER,
  TYPE_ALIASES,
  importNames,
  isSchemaModule,
  lineAt,
  parseTables,
  walk
} from "./lib/schema-parse.mjs";

const ROOT = process.cwd();
const SCHEMA_FILE = "src/lib/server/db/sms-schema.ts";
const OUT_FILE = "docs/cloudflare-port/audit/schema-usage.json";

const schemaSource = readFileSync(join(ROOT, SCHEMA_FILE), "utf8");
const tables = parseTables(schemaSource);
const knownVars = new Set(tables.map((t) => t.var));

const files = walk(ROOT, join(ROOT, "src")).filter((f) => !SCHEMA_LAYER.has(f));
const unmatchedIdentifiers = new Map();

function noteUnmatched(name) {
  if (knownVars.has(name) || TYPE_ALIASES.has(name)) return false;
  unmatchedIdentifiers.set(name, (unmatchedIdentifiers.get(name) ?? 0) + 1);
  return true;
}

function pushUsage(collected, exportName, file, line) {
  if (!collected.has(exportName)) collected.set(exportName, []);
  collected.get(exportName).push({ file, line });
}

/**
 * Collect every real reference site. Import statements themselves do not count
 * as usage — only references to the imported binding do.
 */
function collectUsage() {
  const collected = new Map();

  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const lines = text.split("\n");
    /** localName -> exportName */
    const locals = new Map();

    for (const m of text.matchAll(IMPORT_RE)) {
      const [, , starClause, namespaceName, braceBody, , specifier] = m;
      if (!isSchemaModule(specifier)) continue;

      if (starClause) {
        const refRe = new RegExp(`\\b${namespaceName}\\.(\\w+)\\b`, "g");
        for (const ref of text.matchAll(refRe)) {
          const name = ref[1];
          if (noteUnmatched(name)) continue;
          pushUsage(collected, name, file, lineAt(text, ref.index));
        }
        continue;
      }

      for (const name of importNames(braceBody)) {
        if (noteUnmatched(name)) continue;
        locals.set(name, name);
      }
    }

    for (const m of text.matchAll(DYNAMIC_RE)) {
      if (!isSchemaModule(m[3])) continue;
      for (const name of importNames(m[1])) {
        if (noteUnmatched(name)) continue;
        locals.set(name, name);
      }
    }

    for (const [local, exportName] of locals) {
      const refRe = new RegExp(`\\b${local}\\b`, "g");
      for (const ref of text.matchAll(refRe)) {
        const line = lineAt(text, ref.index);
        if (lines[line - 1]?.includes("import")) continue;
        pushUsage(collected, exportName, file, line);
      }
    }
  }

  return collected;
}

const collected = collectUsage();

const entries = tables
  .map((t) => {
    const sites = (collected.get(t.var) ?? [])
      .filter((s, i, arr) => arr.findIndex((o) => o.file === s.file && o.line === s.line) === i)
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    return { var: t.var, dbName: t.dbName, startLine: t.startLine, endLine: t.endLine, usageSites: sites };
  })
  .filter((t) => t.usageSites.length > 0)
  .sort((a, b) => a.var.localeCompare(b.var));

mkdirSync(join(ROOT, "docs/cloudflare-port/audit"), { recursive: true });
writeFileSync(join(ROOT, OUT_FILE), `${JSON.stringify(entries, null, 2)}\n`);

const failures = [];
if (tables.length !== 310) failures.push(`expected 310 table definitions, found ${tables.length}`);

const schemaLines = schemaSource.split("\n");
for (const e of entries) {
  if (!e.var || !e.dbName) failures.push(`entry missing var/dbName: ${JSON.stringify(e)}`);
  if (!Number.isInteger(e.startLine) || !Number.isInteger(e.endLine)) failures.push(`${e.var}: bad line range`);
  if (!Array.isArray(e.usageSites) || e.usageSites.length === 0) failures.push(`${e.var}: no usage sites`);
  const exportLine = schemaLines[e.startLine - 1] ?? "";
  if (!exportLine.includes(`export const ${e.var}`))
    failures.push(`${e.var}: startLine ${e.startLine} does not contain the declaration`);
  for (const site of e.usageSites) {
    const siteLine = readFileSync(join(ROOT, site.file), "utf8").split("\n")[site.line - 1] ?? "";
    if (!siteLine.includes(e.var.split(" ")[0]) && !siteLine.includes(e.var))
      failures.push(`${e.var}: usage site ${site.file}:${site.line} does not mention the binding`);
  }
}

const smStudents = entries.find((e) => e.var === "smStudents");
if (!smStudents) failures.push("smStudents missing from used set");
else if (smStudents.dbName !== "sm_students")
  failures.push(`smStudents dbName is ${smStudents.dbName}, expected sm_students`);

for (const required of ["smStaffs", "users", "smClasses", "smSections"]) {
  if (!entries.some((e) => e.var === required)) failures.push(`expected ${required} in used set`);
}
for (const forbidden of ["sessions", "encryptedCredentials", "mastraRuns", "tokenUsage"]) {
  if (entries.some((e) => e.var === forbidden)) failures.push(`${forbidden} must not appear (out of scope)`);
}

console.log(`tables defined: ${tables.length}`);
console.log(`used: ${entries.length}`);
console.log(`unused: ${tables.length - entries.length}`);
console.log(`usage sites: ${entries.reduce((n, e) => n + e.usageSites.length, 0)}`);
if (unmatchedIdentifiers.size > 0) {
  console.log(`unmatched imported identifiers: ${unmatchedIdentifiers.size}`);
  for (const [name, count] of [...unmatchedIdentifiers].sort()) console.log(`  ? ${name} (${count})`);
}
console.log(`wrote ${OUT_FILE}`);

if (failures.length > 0) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("all invariants passed");
