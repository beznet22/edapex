/**
 * Local D1 loader for the tier files.
 *
 * Every command is `wrangler ... --local --persist-to <dir>`; the caller owns
 * the persistence directory and runs the whole rehearsal against it.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");

function run(args, options = {}) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: APP_ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    ...options
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    const stdout = (result.stdout ?? "").trim();
    throw new Error(
      `wrangler ${args.join(" ")} failed (${result.status}): ${stderr || stdout}`
    );
  }
  return result;
}

export function applyMigrations(persist) {
  return run(["d1", "migrations", "apply", "DB", "--local", "--persist-to", path.resolve(persist)]);
}

export function executeFile(persist, file) {
  return run([
    "d1",
    "execute",
    "DB",
    "--local",
    "--file",
    path.resolve(file),
    "--persist-to",
    path.resolve(persist)
  ]);
}

export function executeSql(persist, sql) {
  return run([
    "d1",
    "execute",
    "DB",
    "--local",
    "--command",
    sql,
    "--persist-to",
    path.resolve(persist)
  ]);
}

function parseJsonOutput(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error(`No JSON in wrangler output: ${text.slice(0, 500)}`);
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array from wrangler");
  return parsed.flatMap((entry) => (Array.isArray(entry?.results) ? entry.results : []));
}

export function queryJson(persist, sql) {
  const result = run([
    "d1",
    "execute",
    "DB",
    "--local",
    "--json",
    "--command",
    sql,
    "--persist-to",
    path.resolve(persist)
  ]);
  return parseJsonOutput(result.stdout ?? "");
}

export function foreignKeyCheck(persist) {
  return queryJson(persist, "PRAGMA foreign_key_check;");
}

export function countTable(persist, table) {
  const rows = queryJson(persist, `SELECT COUNT(*) AS count FROM "${table}";`);
  return Number(rows[0]?.count ?? 0);
}

export function sequenceRows(persist, tables) {
  if (tables.length === 0) return new Map();
  const list = tables.map((table) => `'${table.replaceAll("'", "''")}'`).join(", ");
  const rows = queryJson(
    persist,
    `SELECT name, seq FROM sqlite_sequence WHERE name IN (${list});`
  );
  return new Map(rows.map((row) => [String(row.name), Number(row.seq)]));
}

export function loadTierFiles(persist, files) {
  for (const file of files) executeFile(persist, file);
}
