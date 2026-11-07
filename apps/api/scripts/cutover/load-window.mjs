#!/usr/bin/env node
/**
 * Resumable one-window D1 loader.
 *
 * Runs the live-only load plan file by file, reads `meta.rows_written`, and
 * stops at the 95k target / 100k hard cap. A completed file is checkpointed;
 * the next run (after 00:00 UTC the next day) resumes the remaining files.
 * Dry-run is the default; `--execute` is required for remote work.
 *
 * Usage (from apps/api/):
 *   node scripts/cutover/load-window.mjs \
 *     --plan .tmp/cutover-plan/live/load-plan.json \
 *     --state .tmp/cutover-plan/load-state.json \
 *     --budget 95000 [--execute]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_BUDGET,
  HARD_CAP,
  nextAction,
  normalizeState,
  parseWrites,
  recordFile
} from "./load-window-plan.mjs";

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
const statePath = path.resolve(
  valueOf("--state", ".tmp/cutover-plan/load-state.json")
);
const budget = Number(valueOf("--budget", String(DEFAULT_BUDGET)));
const date = valueOf("--date", new Date().toISOString().slice(0, 10));
const execute = has("--execute");

if (!Number.isInteger(budget) || budget <= 0 || budget > HARD_CAP) {
  console.error(`--budget must be an integer between 1 and ${HARD_CAP}`);
  process.exit(1);
}
if (!existsSync(planPath)) {
  console.error(`load plan not found: ${planPath}`);
  process.exit(1);
}
const plan = JSON.parse(readFileSync(planPath, "utf8"));
if (!Array.isArray(plan.files) || plan.files.length === 0) {
  console.error("load plan has no files");
  process.exit(1);
}

const state = normalizeState(
  existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8"))
    : null,
  date
);

function saveState(value) {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(value, null, 2)}\n`);
}

function printFile(file) {
  return `${file.name} (${String(file.rows)} rows, ${file.table})`;
}

if (!execute) {
  console.log(`plan: ${planPath}`);
  console.log(`state: ${statePath}`);
  console.log(`budget: ${budget}; completed: ${state.completed.length}/${plan.files.length}`);
  for (const file of plan.files) {
    if (!state.completed.includes(file.name)) console.log(`next: ${printFile(file)}`);
  }
  console.log("Dry run only; pass --execute to run the remote load.");
  process.exit(0);
}

function runFile(file) {
  const absolute = path.resolve(APP_ROOT, file.relativePath);
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", "--remote", "--json", "--file", absolute],
    {
      cwd: APP_ROOT,
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }
    }
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `wrangler d1 execute failed for ${file.name}: ${(result.stderr ?? "").trim()}`
    );
  }
  return parseWrites(result.stdout ?? "");
}

try {
  for (;;) {
    const action = nextAction(plan, state, budget);
    if (action.kind === "finished") {
      state.finished = true;
      saveState(state);
      console.log(`complete: ${state.totalWrites} writes across ${state.completed.length} files`);
      break;
    }
    if (action.kind === "wait") {
      saveState(state);
      console.log(
        `budget reached: ${state.windowWrites} writes on ${state.date}; ` +
          "resume after 00:00 UTC the next day"
      );
      break;
    }
    const file = action.file;
    if (file === undefined) {
      saveState(state);
      break;
    }
    if (file.rows > action.remaining) {
      saveState(state);
      console.log(
        `next file ${file.name} (${file.rows} rows) does not fit the remaining ` +
          `${action.remaining} budget; resume after 00:00 UTC the next day`
      );
      break;
    }
    const writes = runFile(file);
    state.completed.push(file.name);
    const nextState = recordFile(state, file.name, writes, plan.files.length);
    Object.assign(state, nextState);
    saveState(state);
    console.log(`${file.name}: ${writes} writes; total ${state.totalWrites}`);
  }
} catch (error) {
  saveState(state);
  throw error;
}
