#!/usr/bin/env node
/**
 * Phase 8 dry-run preflight.
 *
 * Runs the tested Phase 7 transform and local load against a source dump, then
 * writes a production command plan. It never calls `wrangler ... --remote`; the
 * generated `d1-load.sh`, `d1-verify.sh` and `photo-upload.sh` are for the
 * approved cutover window only.
 *
 * Usage (from apps/api/):
 *   node scripts/cutover/preflight.mjs --source ../../edapexdb.sql \
 *     --out .tmp/cutover-plan --digest <64-hex> [--fresh] [--date YYYY-MM-DD]
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import { inventoryPhotos } from "../migration/photos.mjs";
import { LEGACY_TABLES, TABLE_TIER } from "../migration/tables.mjs";
import {
  PreflightError,
  assertOutputUnderTmp,
  buildCutoverPlan,
  renderD1LoadScript,
  renderD1VerifyScript,
  renderD1VerifyWrapper,
  renderMissingPhotosCsv,
  renderPhotoUploadScript
} from "./preflight-plan.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);

const source = path.resolve(valueOf("--source", "../../edapexdb.sql"));
const out = assertOutputUnderTmp(
  APP_ROOT,
  path.resolve(valueOf("--out", ".tmp/cutover-plan"))
);
const digest = valueOf("--digest");
const date = valueOf("--date", new Date().toISOString().slice(0, 10));
const fresh = has("--fresh");

if (digest === undefined || !/^[0-9a-f]{64}$/i.test(digest)) {
  console.error(
    "usage: node scripts/cutover/preflight.mjs --source <dump> --out <dir> --digest <64-hex> [--fresh]"
  );
  process.exit(1);
}
if (!existsSync(source)) throw new PreflightError(`Source dump not found: ${source}`);
if (existsSync(out) && !fresh) {
  throw new PreflightError(`Output already exists: ${out}; rerun with --fresh`);
}
if (fresh) rmSync(out, { recursive: true, force: true });

const sqlDir = path.join(out, "sql");
const transformDir = path.join(out, "transform");
const persistDir = path.join(out, "d1");
mkdirSync(sqlDir, { recursive: true });
mkdirSync(transformDir, { recursive: true });

function runNode(script, scriptArgs) {
  const result = spawnSync("node", [path.join(APP_ROOT, script), ...scriptArgs], {
    cwd: APP_ROOT,
    stdio: "inherit",
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new PreflightError(`${script} exited with ${result.status ?? "signal"}`);
  }
}

console.log(`source: ${source}`);
console.log("step 1/2: transform");
runNode("scripts/migration/transform-cli.mjs", [
  "--source",
  source,
  "--out",
  transformDir,
  "--digest",
  digest,
  "--date",
  date
]);

console.log("step 2/2: local load and verification");
runNode("scripts/migration/load-cli.mjs", [
  "--source",
  source,
  "--persist",
  persistDir,
  "--out",
  sqlDir,
  "--digest",
  digest,
  "--date",
  date,
  "--fresh"
]);

const sourceSha256 = createHash("sha256").update(readFileSync(source)).digest("hex");
const loadEvidence = JSON.parse(
  readFileSync(path.join(persistDir, "load-evidence.json"), "utf8")
);
const manifest = JSON.parse(
  readFileSync(path.join(transformDir, "manifest.json"), "utf8")
);
const photoReferences = JSON.parse(
  readFileSync(path.join(transformDir, "photos.json"), "utf8")
);
const photos = inventoryPhotos(photoReferences);

const sqlFiles = [];
for (const table of LEGACY_TABLES) {
  const file = path.join(sqlDir, `tier-${TABLE_TIER[table] ?? 0}-${table}.sql`);
  if (existsSync(file)) sqlFiles.push(file);
}
for (const name of ["current-records.sql", "resolutions.sql", "sequence-fix.sql"]) {
  const file = path.join(sqlDir, name);
  if (existsSync(file)) sqlFiles.push(file);
}

const sqlFileRecords = sqlFiles.map((file) => {
  const bytes = readFileSync(file);
  return {
    name: path.basename(file),
    relativePath: path.relative(APP_ROOT, file),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length
  };
});

const plan = buildCutoverPlan({
  source,
  sourceSha256,
  generatedAt: new Date().toISOString(),
  loadEvidence,
  manifest,
  photos,
  sqlFiles: sqlFileRecords
});

writeFileSync(
  path.join(out, "cutover-plan.json"),
  `${JSON.stringify(plan, null, 2)}\n`
);
const scripts = [
  ["d1-load.sh", renderD1LoadScript(plan.sqlFiles, APP_ROOT)],
  ["d1-verify.mjs", renderD1VerifyScript(APP_ROOT)],
  ["d1-verify.sh", renderD1VerifyWrapper(out, APP_ROOT)],
  ["photo-upload.sh", renderPhotoUploadScript(photos.rows, APP_ROOT)],
  ["missing-photos.csv", renderMissingPhotosCsv(photos.rows)]
];
for (const [name, content] of scripts) {
  const file = path.join(out, name);
  writeFileSync(file, content);
  if (name.endsWith(".sh")) chmodSync(file, 0o755);
}

console.log("");
console.log(`source sha256: ${sourceSha256}`);
console.log(`tables: ${plan.tables}`);
console.log(`rows: ${plan.rows}`);
console.log(`resolutions: ${plan.resolutions}`);
console.log(`sql files: ${plan.sqlFiles.length}`);
console.log(
  `photos: ${plan.photos.referenced} referenced, ${plan.photos.uploadable} uploadable, ` +
    `${plan.photos.missing} missing`
);
console.log(`plan: ${path.join(out, "cutover-plan.json")}`);
console.log("");
console.log("Production commands (NOT executed):");
console.log("  pnpm exec wrangler d1 migrations apply DB --remote");
console.log(`  bash ${path.join(out, "d1-load.sh")}`);
console.log(`  bash ${path.join(out, "d1-verify.sh")}`);
console.log(`  bash ${path.join(out, "photo-upload.sh")}`);
console.log("");
console.log("No remote command was executed.");
