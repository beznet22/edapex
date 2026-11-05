#!/usr/bin/env node
/**
 * Validates docs/schema-catalog.md against the generated audit data.
 *
 * Checks, in order:
 *   1. every used table in .kimchi/docs/schema-usage.json has exactly one row
 *   2. no row references a table outside the used set, and no duplicates
 *   3. every "Source File" anchor resolves to the line declaring that table
 *   4. every usage link resolves to a real file and an in-range line
 *   5. the trailing flat export list matches the catalog exactly
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CATALOG = "docs/cloudflare-port/schema-catalog.md";
const USAGE = ".kimchi/docs/schema-usage.json";
import { dirname } from "node:path";
/** Links in the catalog are relative to the catalog file, not the repo root. */
const CATALOG_DIR = dirname(CATALOG);

const usage = JSON.parse(readFileSync(join(ROOT, USAGE), "utf8"));
const expectedVars = usage.map((u) => u.var).sort((a, b) => a.localeCompare(b));
const expectedSet = new Set(expectedVars);

const markdown = readFileSync(join(ROOT, CATALOG), "utf8");
const lines = markdown.split("\n");

/** Table rows are the ones whose first cell is a backticked identifier. */
const RECOMMENDATIONS_HEADING = /^## Recommended additions/;
const recommendationsIndex = lines.findIndex((l) => RECOMMENDATIONS_HEADING.test(l));
const cutoff = recommendationsIndex === -1 ? lines.length : recommendationsIndex;

const rows = [];
lines.forEach((line, index) => {
  if (index >= cutoff) return;
  const m = /^\|\s*`(\w+)`\s*\|/.exec(line);
  if (m) rows.push({ var: m[1], line, lineNumber: index + 1 });
});

const failures = [];
const seen = new Map();
for (const row of rows) {
  seen.set(row.var, (seen.get(row.var) ?? 0) + 1);
  if (!expectedSet.has(row.var)) failures.push(`row for ${row.var} is not in the used set`);
}

const duplicates = [...seen].filter(([, n]) => n > 1).map(([v]) => v);
if (duplicates.length > 0) failures.push(`duplicate rows: ${duplicates.join(", ")}`);

const missing = expectedVars.filter((v) => !seen.has(v));
if (missing.length > 0) failures.push(`missing rows: ${missing.join(", ")}`);

const badRows = rows.filter((r) => {
  const cells = r.line.split("|");
  return cells.length < 6;
});
if (badRows.length > 0) failures.push(`rows with wrong column count: ${badRows.map((r) => r.var).join(", ")}`);

// ---------------------------------------------------------------------------
// Link resolution
// ---------------------------------------------------------------------------
const linkRe = /\]\((\.\.\/[^)#]+)#L(\d+)\)/g;
const fileCache = new Map();

function readTarget(relPath) {
  const abs = join(ROOT, CATALOG_DIR, relPath);
  if (!fileCache.has(abs)) {
    fileCache.set(abs, existsSync(abs) ? readFileSync(abs, "utf8").split("\n") : null);
  }
  return fileCache.get(abs);
}

let brokenFiles = 0;
let brokenAnchors = 0;

for (const row of rows) {
  const json = usage.find((u) => u.var === row.var);
  let checkedSource = false;

  for (const m of row.line.matchAll(linkRe)) {
    const [, relPath, rawLine] = m;
    const lineNo = Number(rawLine);
    const target = readTarget(relPath);
    if (target === null) {
      failures.push(`${row.var}: link target does not exist — ${relPath}`);
      brokenFiles += 1;
      continue;
    }
    const text = target[lineNo - 1];
    if (text === undefined) {
      failures.push(`${row.var}: line ${lineNo} is out of range for ${relPath}`);
      brokenAnchors += 1;
      continue;
    }
    if (relPath.endsWith("sms-schema.ts")) {
      checkedSource = true;
      if (!text.includes(`export const ${row.var}`)) {
        failures.push(`${row.var}: source anchor ${relPath}#L${lineNo} does not declare the table`);
        brokenAnchors += 1;
      }
      if (json && lineNo !== json.startLine) {
        failures.push(`${row.var}: source anchor line ${lineNo} != inventory startLine ${json.startLine}`);
        brokenAnchors += 1;
      }
    } else if (text.trim().length === 0) {
      failures.push(`${row.var}: usage anchor ${relPath}#L${lineNo} points at a blank line`);
      brokenAnchors += 1;
    }
  }

  if (!checkedSource) failures.push(`${row.var}: no Source File anchor to sms-schema.ts`);
}

// ---------------------------------------------------------------------------
// Flat export list
// ---------------------------------------------------------------------------
const listMatch = /```text\n([\s\S]*?)\n```/.exec(markdown);
if (!listMatch) {
  failures.push("flat export list block (```text ... ```) is missing");
} else {
  const listVars = listMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const expectedList = [...expectedVars];
  if (listVars.length !== expectedList.length) {
    failures.push(`flat list has ${listVars.length} entries, expected ${expectedList.length}`);
  }
  for (let i = 0; i < Math.min(listVars.length, expectedList.length); i += 1) {
    if (listVars[i] !== expectedList[i]) {
      failures.push(`flat list mismatch at position ${i + 1}: "${listVars[i]}" != "${expectedList[i]}"`);
      break;
    }
  }
}

console.log(`rows: ${rows.length}`);
console.log(`expected: ${expectedVars.length}`);
console.log(`duplicates: ${duplicates.length}`);
console.log(`missing: ${missing.length}`);
console.log(`broken anchors: ${brokenAnchors}`);
console.log(`broken files: ${brokenFiles}`);

if (failures.length > 0) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("catalog verified");
