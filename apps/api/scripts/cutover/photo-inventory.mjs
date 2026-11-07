#!/usr/bin/env node
/**
 * Inventory the production student-photo ZIP against the dump's referenced URLs.
 *
 * The current static tree is stale; this script takes an extracted production
 * directory, writes a fresh upload script and missing-photo CSV, and never
 * performs a remote R2 write.
 *
 * Usage (from apps/api/):
 *   node scripts/cutover/photo-inventory.mjs \
 *     --photos-dir .tmp/photos-production/student \
 *     --references .tmp/cutover-plan/transform/photos.json \
 *     --out .tmp/cutover-plan/photos-prod
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { inventoryPhotos } from "../migration/photos.mjs";
import {
  PreflightError,
  assertOutputUnderTmp,
  renderMissingPhotosCsv,
  renderPhotoUploadScript
} from "./preflight-plan.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const photoDirs = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--photos-dir" && args[index + 1] !== undefined) {
    photoDirs.push(path.resolve(args[index + 1]));
  }
}
if (photoDirs.length === 0) {
  photoDirs.push(path.resolve(".tmp/photos-production/student"));
}
const referencesPath = path.resolve(
  valueOf("--references", ".tmp/cutover-plan/transform/photos.json")
);
const out = assertOutputUnderTmp(
  APP_ROOT,
  path.resolve(valueOf("--out", ".tmp/cutover-plan/photos-prod"))
);

for (const dir of photoDirs) {
  if (!existsSync(dir)) {
    throw new PreflightError(`Production photo directory not found: ${dir}`);
  }
}
if (!existsSync(referencesPath)) {
  throw new PreflightError(`Photo references not found: ${referencesPath}`);
}
const references = JSON.parse(readFileSync(referencesPath, "utf8"));
if (!Array.isArray(references)) {
  throw new PreflightError("photos.json must be an array");
}
const inventory = inventoryPhotos(references, photoDirs);
mkdirSync(out, { recursive: true });

const primaryRoot = photoDirs[0];
const primaryPrefix = `${primaryRoot}${path.sep}`;
const productionFiles = new Set(
  inventory.rows
    .filter((row) => row.path !== null && row.path.startsWith(primaryPrefix))
    .map((row) => row.file)
);
const staticFallback = inventory.rows.filter(
  (row) => row.path !== null && !row.path.startsWith(primaryPrefix)
);


const uploadScript = renderPhotoUploadScript(inventory.rows, APP_ROOT);
const uploadPath = path.join(out, "photo-upload.sh");
writeFileSync(uploadPath, uploadScript);
chmodSync(uploadPath, 0o755);
writeFileSync(
  path.join(out, "missing-photos.csv"),
  renderMissingPhotosCsv(inventory.rows)
);
writeFileSync(
  path.join(out, "static-fallback.csv"),
  ["file,url,path"]
    .concat(
      staticFallback.map((row) => `${row.file},${row.url},${row.path ?? ""}`)
    )
    .join("\n") + "\n"
);
writeFileSync(
  path.join(out, "inventory.json"),
  `${JSON.stringify(
    {
      photoRoots: photoDirs,
      references: referencesPath,
      referenced: inventory.referenced,
      images: inventory.images,
      pdfs: inventory.pdfs,
      other: inventory.other,
      missing: inventory.missing,
      uploadable: inventory.uploadable.length,
      fromProductionZip: productionFiles.size,
      fromStaticFallback: staticFallback.length,
      bytes: inventory.bytes,
      rows: inventory.rows
    },
    null,
    2
  )}\n`
);

console.log(`photo roots: ${photoDirs.join(", ")}`);
console.log(`referenced: ${inventory.referenced}`);
console.log(`images: ${inventory.images}`);
console.log(`uploadable: ${inventory.uploadable.length}`);
console.log(`from production ZIP: ${productionFiles.size}`);
console.log(`from static fallback: ${staticFallback.length}`);
console.log(`missing: ${inventory.missing}`);
console.log(`bytes: ${inventory.bytes}`);
console.log(`upload script: ${uploadPath}`);
if (inventory.missing > 0) {
  console.error("Production photo set is incomplete; review missing-photos.csv");
  process.exit(1);
}
console.log("All referenced photos are present in the production ZIP.");
