#!/usr/bin/env node
/**
 * One-time import of `data/report-settings/*.json` into D1 `report_settings`.
 *
 * Usage:
 *   node scripts/import-report-settings.mjs --dir tests/fixtures/report-settings --check
 *   node scripts/import-report-settings.mjs --dir <dir> --apply --verify
 *
 * `--check` validates every file and prints the count. `--apply` writes SQL and
 * executes it against the local D1 database; `--verify` re-reads and compares
 * the row count and payloads.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_DIR = path.resolve(ROOT, "..", "..", "data", "report-settings");
const SQL_PATH = path.join(ROOT, ".tmp", "report-settings-import.sql");

const settingsSchema = z
  .object({
    termlyReportTitle: z.string().optional(),
    annualReportTitle: z.string().optional(),
    principalName: z.string().optional(),
    supportEmail: z.string().optional(),
    resultEmailSubject: z.string().optional(),
    updatedAt: z.string().optional(),
    updatedBy: z.number().nullable().optional()
  })
  .strict();

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith("--")) continue;
  const next = process.argv[index + 1];
  if (next !== undefined && !next.startsWith("--")) {
    args.set(token.slice(2), next);
    index += 1;
  } else {
    args.set(token.slice(2), true);
  }
}

const dir = path.resolve(ROOT, String(args.get("dir") ?? DEFAULT_DIR));
const expectCount = args.get("expect");
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.error(`No report-settings JSON files found in ${dir}`);
  process.exit(1);
}
if (expectCount !== undefined && Number(expectCount) !== files.length) {
  console.error(`Expected ${expectCount} files, found ${files.length}`);
  process.exit(1);
}

const rows = [];
for (const fileName of files) {
  const schoolId = Number(fileName.replace(/\.json$/, ""));
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    console.error(`Invalid school id in filename: ${fileName}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(path.join(dir, fileName), "utf8"));
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`Invalid report settings in ${fileName}: ${parsed.error.message}`);
    process.exit(1);
  }
  const updatedAt = parsed.data.updatedAt ?? new Date().toISOString();
  rows.push({
    schoolId,
    payload: JSON.stringify(parsed.data),
    updatedAt: Math.floor(new Date(updatedAt).getTime() / 1000)
  });
}

rows.sort((left, right) => left.schoolId - right.schoolId);
console.log(`report-settings import: ${rows.length} file(s) from ${dir}`);

if (args.get("check") === true) {
  for (const row of rows) {
    console.log(`  school ${row.schoolId}: ${row.payload.length} bytes`);
  }
  process.exit(0);
}

const escapeSql = (value) => value.replaceAll("'", "''");
const sql = rows
  .map(
    (row) =>
      `INSERT INTO report_settings (school_id, payload, updated_at) VALUES (${row.schoolId}, '${escapeSql(row.payload)}', ${row.updatedAt}) ON CONFLICT(school_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at;`
  )
  .join("\n");
mkdirSync(path.dirname(SQL_PATH), { recursive: true });
writeFileSync(SQL_PATH, `${sql}\n`, "utf8");
console.log(`SQL written to ${SQL_PATH}`);

const runWrangler = (wranglerArgs) =>
  execFileSync("pnpm", ["exec", "wrangler", ...wranglerArgs], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

if (args.get("apply") === true) {
  runWrangler(["d1", "execute", "DB", "--local", "--file", SQL_PATH]);
  console.log(`Applied ${rows.length} row(s) to local D1`);
}

if (args.get("verify") === true) {
  const output = runWrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--json",
    "--command",
    "SELECT school_id, payload FROM report_settings ORDER BY school_id"
  ]);
  const parsed = JSON.parse(output);
  const results = Array.isArray(parsed)
    ? (parsed[0]?.results ?? [])
    : (parsed?.results ?? []);
  if (results.length !== rows.length) {
    console.error(`Verification failed: expected ${rows.length} rows, found ${results.length}`);
    process.exit(1);
  }
  for (const row of rows) {
    const found = results.find((entry) => entry.school_id === row.schoolId);
    if (found === undefined || found.payload !== row.payload) {
      console.error(`Verification failed for school ${row.schoolId}`);
      process.exit(1);
    }
  }
  console.log(`Verified ${results.length} row(s) against the JSON payloads`);
}
