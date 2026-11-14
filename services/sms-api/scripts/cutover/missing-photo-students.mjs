#!/usr/bin/env node
/**
 * Report students who still need a photo upload, restricted to active students
 * with an active default 2026/27 class/section.
 *
 * The output is PII-bearing and stays under .tmp; never commit it.
 *
 * Usage (from apps/api/):
 *   node scripts/cutover/missing-photo-students.mjs \
 *     --persist .tmp/rehearsal-a \
 *     --missing .tmp/cutover-plan/photos-union/missing-photos.csv \
 *     --out .tmp/cutover-plan/photos-union/missing-photo-students.csv
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { queryJson } from "../migration/load.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const persist = path.resolve(valueOf("--persist", ".tmp/rehearsal-a"));
const missingPath = path.resolve(
  valueOf("--missing", ".tmp/cutover-plan/photos-union/missing-photos.csv")
);
const out = path.resolve(
  valueOf("--out", ".tmp/cutover-plan/photos-union/missing-photo-students.csv")
);
const academicId = Number(valueOf("--academic-id", "5"));

if (!existsSync(missingPath)) {
  console.error(`missing-photos.csv not found: ${missingPath}`);
  process.exit(1);
}

const missingLines = readFileSync(missingPath, "utf8").split(/\r?\n/).filter(Boolean);
const missing = new Set();
for (const line of missingLines.slice(1)) {
  const comma = line.indexOf(",");
  const file = comma < 0 ? line : line.slice(0, comma);
  if (file.length > 0) missing.add(file);
}

const rows = queryJson(
  persist,
  `SELECT s.id AS student_id,
          s.admission_no,
          s.full_name,
          s.student_photo,
          sr.id AS record_id,
          sr.class_id,
          sr.section_id,
          c.class_name,
          sec.section_name
     FROM sm_students s
     JOIN student_records sr
       ON sr.student_id = s.id
      AND sr.academic_id = ${academicId}
      AND sr.is_default = 1
      AND sr.active_status = 1
      AND sr.class_id IS NOT NULL
      AND sr.section_id IS NOT NULL
     LEFT JOIN sm_classes c
       ON c.id = sr.class_id
      AND c.active_status = 1
     LEFT JOIN sm_sections sec
       ON sec.id = sr.section_id
      AND sec.active_status = 1
    WHERE s.active_status = 1
      AND s.student_photo IS NOT NULL
      AND s.student_photo <> ''
    ORDER BY sr.class_id, sr.section_id, s.id;`
);

function baseName(value) {
  const text = String(value);
  const slash = text.lastIndexOf("/");
  return (slash < 0 ? text : text.slice(slash + 1)).toLowerCase();
}

const missingLower = new Set([...missing].map((file) => file.toLowerCase()));
const report = rows
  .map((row) => {
    const file = baseName(row.student_photo);
    return { ...row, missing_file: file };
  })
  .filter((row) => missingLower.has(row.missing_file));

function csv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const header = [
  "student_id",
  "admission_no",
  "full_name",
  "class_name",
  "section_name",
  "missing_file",
  "student_photo"
];
const lines = [header.join(",")];
for (const row of report) {
  lines.push(
    header
      .map((key) => {
        if (key === "missing_file") return csv(row.missing_file);
        if (key === "student_photo") return csv(row.student_photo);
        return csv(row[key]);
      })
      .join(",")
  );
}
writeFileSync(out, `${lines.join("\n")}\n`);

const uniqueFiles = new Set(report.map((row) => row.missing_file));
const classes = new Set(report.map((row) => row.class_name ?? ""));
console.log(`target active/default records: ${rows.length}`);
console.log(`active students needing a photo: ${report.length}`);
console.log(`unique missing files: ${uniqueFiles.size}`);
console.log(`classes affected: ${[...classes].filter(Boolean).sort().join(", ")}`);
console.log(`report: ${out}`);
