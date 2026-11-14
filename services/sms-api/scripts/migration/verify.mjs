#!/usr/bin/env node
/**
 * Compares two rehearsal evidence files. Run A and run B must agree on every
 * data count, checksum and gate outcome; run-specific timestamps, job ids and
 * the photo upload mode are intentionally excluded.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const pathA = valueOf("--a");
const pathB = valueOf("--b");
if (pathA === undefined || pathB === undefined) {
  console.error("usage: node scripts/migration/verify.mjs --a <evidence-a.json> --b <evidence-b.json>");
  process.exit(1);
}

const a = JSON.parse(readFileSync(pathA, "utf8"));
const b = JSON.parse(readFileSync(pathB, "utf8"));
const differences = [];

function compare(label, left, right) {
  const leftText = JSON.stringify(left);
  const rightText = JSON.stringify(right);
  if (leftText !== rightText) {
    differences.push({ label, a: leftText, b: rightText });
  }
}

compare("status", a.status, b.status);
compare("sourceSha256", a.sourceSha256, b.sourceSha256);
compare("load.tables", a.load?.tables, b.load?.tables);
compare("load.rows", a.load?.rows, b.load?.rows);
compare("load.findings", a.load?.findings, b.load?.findings);
compare("reconciliation", a.reconciliation, b.reconciliation);
compare("bootstrap.result", a.bootstrap?.job?.result?.counts, b.bootstrap?.job?.result?.counts);
compare(
  "bootstrap.readiness",
  a.bootstrap?.job?.result?.readiness,
  b.bootstrap?.job?.result?.readiness
);
compare("activation", a.activation?.activeId, b.activation?.activeId);
compare("staffing", a.staffing?.remaining, b.staffing?.remaining);
compare(
  "archive.sessions",
  (a.archive?.sessions ?? []).map((row) => ({
    sessionId: row.sessionId,
    status: row.status,
    objects: row.objects,
    summaries: row.summaries,
    manifestObjects: row.manifestObjects,
    gaps: row.gaps
  })),
  (b.archive?.sessions ?? []).map((row) => ({
    sessionId: row.sessionId,
    status: row.status,
    objects: row.objects,
    summaries: row.summaries,
    manifestObjects: row.manifestObjects,
    gaps: row.gaps
  }))
);
compare("archive.live", a.archive?.live, b.archive?.live);
compare("promotion.actual", a.promotion?.actual, b.promotion?.actual);
compare("promotion.integrity", a.promotion?.integrity?.readiness, b.promotion?.integrity?.readiness);
compare(
  "photos",
  {
    referenced: a.photos?.referenced,
    images: a.photos?.images,
    pdfs: a.photos?.pdfs,
    missing: a.photos?.missing,
    uploadable: a.photos?.uploadable,
    bytes: a.photos?.bytes
  },
  {
    referenced: b.photos?.referenced,
    images: b.photos?.images,
    pdfs: b.photos?.pdfs,
    missing: b.photos?.missing,
    uploadable: b.photos?.uploadable,
    bytes: b.photos?.bytes
  }
);
compare(
  "timelines",
  (a.timelines ?? []).map(({ academicId, rows, bytes, sha256 }) => ({
    academicId,
    rows,
    bytes,
    sha256
  })),
  (b.timelines ?? []).map(({ academicId, rows, bytes, sha256 }) => ({
    academicId,
    rows,
    bytes,
    sha256
  }))
);

const output = {
  a: pathA,
  b: pathB,
  identical: differences.length === 0,
  differences
};
const outPath = path.join(path.dirname(pathA), "reconciliation.json");
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`run A: ${a.status}, run B: ${b.status}`);
console.log(`checks compared: ${15 - differences.length} matching groups`);
console.log(`differences: ${differences.length}`);
for (const difference of differences) {
  console.error(`  ${difference.label}: A=${difference.a} B=${difference.b}`);
}
console.log(`wrote ${outPath}`);
if (differences.length > 0) process.exit(1);
console.log("rehearsals reconciled");
