#!/usr/bin/env node
/**
 * Static guard for the offline migration scripts.
 *
 * The transform is shipped as `.mjs`, so TypeScript cannot protect the
 * 62-table boundary. This check keeps the table list in lockstep with the
 * generated schema fixture and keeps the pure transform free of Node built-ins
 * (the Workers vitest pool imports those modules directly).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { LEGACY_TABLES, TIERS } from "./migration/tables.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "schema-expectations.ts");
const TRANSFORM_DIR = path.join(ROOT, "scripts", "migration", "transform");
const NODE_BUILTINS = /from\s+["']node:(fs|crypto|path|os|readline|stream)["']/g;

export function expectedTables(fixtureText) {
  const match = /export const LEGACY_TABLES: readonly string\[\] = \[([\s\S]*?)\];/.exec(
    fixtureText
  );
  if (match === null) throw new Error("LEGACY_TABLES not found in the schema fixture");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

export function validateTables(expected, actual) {
  const failures = [];
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = [...expectedSet].filter((name) => !actualSet.has(name));
  const extra = [...actualSet].filter((name) => !expectedSet.has(name));
  if (missing.length > 0) failures.push(`missing legacy tables: ${missing.join(", ")}`);
  if (extra.length > 0) failures.push(`unknown legacy tables: ${extra.join(", ")}`);
  if (new Set(actual).size !== actual.length) failures.push("LEGACY_TABLES contains duplicates");
  if (actual.length !== 62) failures.push(`LEGACY_TABLES has ${actual.length} rows, expected 62`);
  const tierSum = TIERS.reduce((sum, tier) => sum + tier.length, 0);
  if (tierSum !== actual.length) {
    failures.push(`tier lists contain ${tierSum} rows, expected ${actual.length}`);
  }
  return failures;
}

function scanPurity() {
  const failures = [];
  for (const entry of readdirSync(TRANSFORM_DIR)) {
    if (!entry.endsWith(".mjs")) continue;
    const file = path.join(TRANSFORM_DIR, entry);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(NODE_BUILTINS)) {
      failures.push(`${path.relative(ROOT, file)} imports node:${match[1]}`);
    }
    if (/\b(TODO|TBD)\b/.test(source)) {
      failures.push(`${path.relative(ROOT, file)} contains a TODO/TBD marker`);
    }
  }
  return failures;
}

function selfTest() {
  const valid = Array.from({ length: 62 }, (_, index) => `table_${index + 1}`);
  const clean = validateTables(valid, [...valid]);
  if (clean.length !== 0) throw new Error(`self-test false positive: ${clean.join("; ")}`);
  const broken = validateTables(valid, [...valid.slice(0, 61), "wrong_table"]);
  if (!broken.some((entry) => entry.includes("missing legacy tables"))) {
    throw new Error("self-test missed the missing-table case");
  }
  if (!broken.some((entry) => entry.includes("unknown legacy tables"))) {
    throw new Error("self-test missed the extra-table case");
  }
  console.log("migration rule self-test passed: table drift detected");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  if (!existsSync(FIXTURE)) {
    console.error("schema fixture is missing");
    process.exit(1);
  }
  const fixtureText = readFileSync(FIXTURE, "utf8");
  const expected = expectedTables(fixtureText);
  const failures = [...validateTables(expected, [...LEGACY_TABLES]), ...scanPurity()];
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`migration check failed: ${failures.length} violation(s)`);
    process.exit(1);
  }
  console.log(
    `migration check passed: ${LEGACY_TABLES.length} legacy tables, ${TIERS.length} tiers, pure transform`
  );
}
