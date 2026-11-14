#!/usr/bin/env node
/**
 * Build the live-only production load plan from the full preflight SQL set.
 *
 * Historical raw tables are excluded; archive metadata SQL from
 * `archive-export.mjs` is inserted between the live tables and the sequence
 * fix. The output is a plan for `load-window.mjs`; it performs no remote work.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LEGACY_TABLES } from "../migration/tables.mjs";
import { readTargetModel } from "../migration/target-schema.mjs";
import {
  PreflightError,
  assertOutputUnderTmp
} from "./preflight-plan.mjs";
import { profileTables } from "./live-profile.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const planPath = path.resolve(valueOf("--plan", ".tmp/cutover-plan/cutover-plan.json"));
const out = assertOutputUnderTmp(
  APP_ROOT,
  path.resolve(valueOf("--out", ".tmp/cutover-plan/live"))
);
const archiveMetadata = path.resolve(
  valueOf("--archive-metadata", ".tmp/cutover-plan/archive/archive-metadata.sql")
);
const archiveSummaryPath = path.resolve(
  valueOf("--archive-summary", ".tmp/cutover-plan/archive/archive-export.json")
);

if (!existsSync(planPath)) {
  throw new PreflightError(`Preflight plan not found: ${planPath}`);
}
if (!existsSync(archiveMetadata)) {
  throw new PreflightError(`Archive metadata SQL not found: ${archiveMetadata}`);
}
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const targetModel = readTargetModel(
  path.resolve(APP_ROOT, "src/lib/server/db/migrations")
);
const profile = profileTables(LEGACY_TABLES, targetModel.foreignKeys);
const liveSet = new Set(profile.live);

function tableOf(file) {
  const match = /^tier-\d+-(.+)\.sql$/.exec(file.name);
  return match === null ? null : match[1];
}

const tierFiles = plan.sqlFiles.filter((file) => {
  const table = tableOf(file);
  return table !== null && liveSet.has(table);
});
const currentRecords = plan.sqlFiles.find((file) => file.name === "current-records.sql");
const sequenceFix = plan.sqlFiles.find((file) => file.name === "sequence-fix.sql");
if (tierFiles.length === 0 || sequenceFix === undefined) {
  throw new PreflightError("Preflight plan is missing live tier files or sequence-fix.sql");
}

const files = [
  ...tierFiles.map((file) => ({
    name: file.name,
    relativePath: file.relativePath,
    table: tableOf(file),
    rows: plan.tableCounts[tableOf(file)]?.expected ?? 0
  })),
  ...(currentRecords === undefined
    ? []
    : [{
        name: currentRecords.name,
        relativePath: currentRecords.relativePath,
        table: "sm_students",
        rows: 0
      }]),
  {
    name: "archive-metadata.sql",
    relativePath: path.relative(APP_ROOT, archiveMetadata),
    table: "archive_objects+session_result_summary",
    rows: 0
  },
  {
    name: sequenceFix.name,
    relativePath: sequenceFix.relativePath,
    table: "sqlite_sequence",
    rows: 0
  }
];

let archive = { objects: 0, summaries: 0 };
if (existsSync(archiveSummaryPath)) {
  const summary = JSON.parse(readFileSync(archiveSummaryPath, "utf8"));
  archive = {
    objects: Number(summary.objects ?? 0),
    summaries: Number(summary.summaries ?? 0)
  };
  const archiveFile = files.find((file) => file.name === "archive-metadata.sql");
  if (archiveFile !== undefined) {
    archiveFile.rows = archive.objects + archive.summaries;
  }
}

const loadPlan = {
  schemaVersion: 1,
  mode: "free-one-window-live-only",
  source: plan.source,
  sourceSha256: plan.sourceSha256,
  generatedAt: new Date().toISOString(),
  liveTables: profile.live,
  excludedTables: profile.excluded,
  archiveMetadata: {
    path: path.relative(APP_ROOT, archiveMetadata),
    objects: archive.objects,
    summaries: archive.summaries
  },
  files,
  totals: {
    liveRows: tierFiles.reduce(
      (sum, file) => sum + (plan.tableCounts[tableOf(file)]?.expected ?? 0),
      0
    ),
    plannedRows: files.reduce((sum, file) => sum + file.rows, 0)
  }
};

mkdirSync(out, { recursive: true });
writeFileSync(
  path.join(out, "load-plan.json"),
  `${JSON.stringify(loadPlan, null, 2)}\n`
);
console.log(`live tables: ${loadPlan.liveTables.length}`);
console.log(`excluded tables: ${loadPlan.excludedTables.length}`);
console.log(`files: ${loadPlan.files.length}`);
console.log(`live rows: ${loadPlan.totals.liveRows}`);
console.log(`archive objects: ${archive.objects}; summaries: ${archive.summaries}`);
console.log(`plan: ${path.join(out, "load-plan.json")}`);
console.log("No remote command was executed.");
