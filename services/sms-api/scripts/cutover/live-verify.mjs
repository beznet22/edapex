#!/usr/bin/env node
/**
 * Verify the live-only production load against the load plan.
 *
 * Checks each live table count, archive metadata counts, historical raw-table
 * emptiness, current-record integrity and foreign keys. Read-only remote
 * access; dry-run is the default.
 *
 * Usage (from apps/api/):
 *   node scripts/cutover/live-verify.mjs \
 *     --plan .tmp/cutover-plan/live/load-plan.json \
 *     --execute
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { HISTORICAL_RAW_TABLES } from "./live-profile.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);
const planPath = path.resolve(
  valueOf("--plan", ".tmp/cutover-plan/live/load-plan.json")
);
const execute = has("--execute");

if (!existsSync(planPath)) {
  console.error(`load plan not found: ${planPath}`);
  process.exit(1);
}
const plan = JSON.parse(readFileSync(planPath, "utf8"));
if (!Array.isArray(plan.files)) {
  console.error("load plan has no files");
  process.exit(1);
}

const expected = [];
for (const file of plan.files) {
  if (!String(file.name).startsWith("tier-")) continue;
  if (typeof file.table !== "string") continue;
  expected.push({ table: file.table, count: file.rows, label: "live" });
}
expected.push({ table: "archive_objects", count: plan.archiveMetadata?.objects ?? 0, label: "archive" });
expected.push({ table: "session_result_summary", count: plan.archiveMetadata?.summaries ?? 0, label: "archive" });
for (const table of HISTORICAL_RAW_TABLES) {
  expected.push({ table, count: 0, label: "historical-empty" });
}

if (!execute) {
  console.log(`plan: ${planPath}`);
  console.log(`live tables: ${plan.liveTables?.length ?? expected.filter((row) => row.label === "live").length}`);
  console.log(`checks: ${expected.length}`);
  for (const row of expected) console.log(`${row.label} ${row.table}: ${row.count}`);
  console.log("Dry run only; pass --execute to query remote D1.");
  process.exit(0);
}

function run(argsToRun) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...argsToRun], {
    cwd: APP_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "").trim());
  }
  return result.stdout ?? "";
}

function parseRows(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("No JSON in wrangler output");
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array from wrangler");
  return parsed.flatMap((entry) =>
    Array.isArray(entry?.results) ? entry.results : []
  );
}

function count(table) {
  const rows = parseRows(
    run([
      "d1",
      "execute",
      "DB",
      "--remote",
      "--json",
      "--command",
      `SELECT COUNT(*) AS count FROM "${table}";`
    ])
  );
  return Number(rows[0]?.count ?? -1);
}

const failures = [];
for (const row of expected) {
  const actual = count(row.table);
  if (actual !== row.count) {
    failures.push({ table: row.table, expected: row.count, actual, label: row.label });
  } else {
    console.log(`ok ${row.label} ${row.table}: ${actual}`);
  }
}

const orphanCurrent = parseRows(
  run([
    "d1",
    "execute",
    "DB",
    "--remote",
    "--json",
    "--command",
    "SELECT COUNT(*) AS count FROM sm_students s LEFT JOIN student_records r ON r.id = s.current_record_id WHERE s.current_record_id IS NOT NULL AND r.id IS NULL;"
  ])
)[0]?.count;
if (Number(orphanCurrent ?? -1) !== 0) {
  failures.push({ check: "current_record_id", expected: 0, actual: Number(orphanCurrent ?? -1) });
}

const fk = parseRows(
  run([
    "d1",
    "execute",
    "DB",
    "--remote",
    "--json",
    "--command",
    "PRAGMA foreign_key_check;"
  ])
);
if (fk.length > 0) {
  failures.push({ check: "foreign_key_check", expected: 0, actual: fk.length });
}

const result = {
  plan: planPath,
  checked: expected.length,
  failures,
  foreignKeyViolations: fk.length
};
const evidence = path.join(path.dirname(planPath), "live-verify.json");
writeFileSync(evidence, `${JSON.stringify(result, null, 2)}\n`);
console.log(`failures: ${failures.length}`);
console.log(`evidence: ${evidence}`);
if (failures.length > 0) {
  console.error(JSON.stringify(failures.slice(0, 20), null, 2));
  process.exit(1);
}
