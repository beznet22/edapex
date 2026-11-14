#!/usr/bin/env node
/**
 * Post-upload photo audit.
 *
 * Reads the photo manifest, downloads each selected object from remote R2 and
 * compares SHA-256 + byte count. This is the consistency check to rerun after
 * any storage move. Read-only remote access; no uploads/deletes.
 *
 * Usage (from apps/api/):
 *   node scripts/cutover/photo-audit.mjs \
 *     --manifest .tmp/cutover-plan/photos-union/inventory.json \
 *     --out .tmp/cutover-plan/photos-union/audit.json \
 *     --execute              # required for remote reads
 *     [--sample 25]          # optional; default all
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import { PreflightError, assertOutputUnderTmp } from "./preflight-plan.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);

const manifestPath = path.resolve(
  valueOf("--manifest", ".tmp/cutover-plan/photos-union/inventory.json")
);
const out = assertOutputUnderTmp(
  APP_ROOT,
  path.resolve(valueOf("--out", ".tmp/cutover-plan/photos-union/audit.json"))
);
const bucket = valueOf("--bucket", "edapex-media");
const sample = Number(valueOf("--sample", "0"));
const execute = has("--execute");

if (!existsSync(manifestPath)) {
  throw new PreflightError(`Photo manifest not found: ${manifestPath}`);
}
if (!Number.isInteger(sample) || sample < 0) {
  throw new PreflightError("--sample must be a non-negative integer");
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.rows)) {
  throw new PreflightError("Photo manifest has no rows");
}
const uploadable = manifest.rows.filter(
  (row) => row.status === "READY" && row.path !== null
);
const selected =
  sample === 0 ? uploadable : uploadable.filter((_, index) => index % sample === 0);

if (!execute) {
  console.log(`manifest: ${manifestPath}`);
  console.log(`uploadable: ${uploadable.length}`);
  console.log(`audit selection: ${selected.length} (sample=${sample || "all"})`);
  console.log(`bucket: ${bucket}`);
  console.log("Dry run only; pass --execute to download and verify remote objects.");
  process.exit(0);
}

const work = path.join(path.dirname(out), "audit-objects");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const failures = [];

for (const row of selected) {
  const key = `uploads/students/${row.file}`;
  const file = path.join(work, row.file);
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", "r2", "object", "get", `${bucket}/${key}`, "--remote", "--file", file],
    {
      cwd: APP_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }
    }
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    failures.push({ file: row.file, reason: "download_failed" });
    continue;
  }
  const bytes = readFileSync(file);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== row.bytes) {
    failures.push({ file: row.file, reason: "bytes_mismatch", expected: row.bytes, actual: bytes.length });
  } else if (digest !== row.sha256) {
    failures.push({ file: row.file, reason: "sha256_mismatch" });
  }
  rmSync(file, { force: true });
}
rmSync(work, { recursive: true, force: true });

const summary = {
  manifest: manifestPath,
  bucket,
  uploadable: uploadable.length,
  audited: selected.length,
  failures: failures.length,
  failureRows: failures
};
writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`audited: ${selected.length}/${uploadable.length}`);
console.log(`failures: ${failures.length}`);
console.log(`evidence: ${out}`);
if (failures.length > 0) process.exit(1);
