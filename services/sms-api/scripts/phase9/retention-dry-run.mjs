#!/usr/bin/env node
/**
 * Phase 9A retention dry-run. Read-only: it counts operational rows in
 * academic years whose end date is older than seven years. It never touches
 * transcript, published-marksheet or archive rows.
 *
 * Usage: node scripts/phase9/retention-dry-run.mjs [--remote|--local]
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mode = process.argv.includes("--local") ? "--local" : "--remote";

export const RETENTION_TABLES = [
  "class_attendances",
  "sm_student_attendances",
  "sm_student_timelines",
  "sm_mark_stores",
  "sm_result_stores",
  "student_ratings",
  "teacher_remarks",
  "sm_homeworks",
  "sm_homework_students"
];

const sql = `
WITH old_years AS (
  SELECT id FROM sm_academic_years
  WHERE ending_date < date('now', '-7 years')
)
SELECT
  (SELECT COUNT(*) FROM old_years) AS old_academic_years,
${RETENTION_TABLES.map(
  (table) =>
    `  (SELECT COUNT(*) FROM ${table} WHERE academic_id IN (SELECT id FROM old_years)) AS ${table}`
).join(",\n")}
`.trim();

const raw = execFileSync(
  "pnpm",
  ["exec", "wrangler", "d1", "execute", "DB", mode, "--json", "--command", sql],
  { cwd: apiRoot, encoding: "utf8", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } }
);
const parsed = JSON.parse(raw);
const rows = parsed[0]?.results ?? [];
console.log(JSON.stringify({ mode, retentionYears: 7, rows }, null, 2));
