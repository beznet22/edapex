#!/usr/bin/env node
/**
 * Targeted reader for the Adminer/MariaDB dump.
 *
 * Parses only the INSERT statements for the tables requested, using the
 * one-row-per-line layout Adminer emits. Values are tab-separated with
 * single-quoted strings; this handles escaped quotes and NULL.
 *
 * Usage: node scripts/inspect-dump.mjs [path-to-dump]
 */
import fs from "node:fs";

const FILE = process.argv[2] ?? "edapexdb.sql";
const TABLES = ["sm_classes", "sm_student_categories", "student_records", "sm_students", "sm_academic_years"];

/** Split one Adminer row "(a,\tb,\t'c')" into raw string fields. */
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("(")) s = s.slice(1);
  if (s.endsWith(");")) s = s.slice(0, -2);
  else if (s.endsWith("),")) s = s.slice(0, -2);
  else if (s.endsWith(")")) s = s.slice(0, -1);

  const fields = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inQuote) {
      if (ch === "\\") {
        cur += s[i + 1] ?? "";
        i += 1;
      } else if (ch === "'") {
        if (s[i + 1] === "'") {
          cur += "'";
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === "'") {
      inQuote = true;
    } else if (ch === "\t") {
      fields.push(cur);
      cur = "";
    } else if (ch === "," && i === s.length - 1) {
      // trailing comma separator between rows
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

const wanted = new Set(TABLES);
const data = new Map(TABLES.map((t) => [t, { cols: [], rows: [] }]));

const lines = fs.readFileSync(FILE, "utf8").split("\n");
let current = null;

for (const line of lines) {
  const header = /^INSERT INTO `([^`]+)` \(([^)]*)\) VALUES/.exec(line);
  if (header) {
    const table = header[1];
    if (!wanted.has(table)) {
      current = null;
      continue;
    }
    current = data.get(table);
    current.cols = header[2].split(",").map((c) => c.trim().replace(/`/g, ""));
    continue;
  }
  if (!current) continue;
  if (!line.startsWith("(")) {
    current = null;
    continue;
  }
  current.rows.push(splitRow(line));
  if (line.endsWith(");")) current = null;
}

const idx = (t, name) => data.get(t).cols.indexOf(name);
const col = (row, t, name) => row[idx(t, name)];

// --- classes ---
const classes = data.get("sm_classes");
console.log(`classes (${classes.rows.length}): columns = ${classes.cols.join(", ")}`);
for (const row of classes.rows) {
  console.log(
    `  id=${col(row, "sm_classes", "id")}  name=${col(row, "sm_classes", "class_name")}  active=${col(row, "sm_classes", "active_status")}`
  );
}

// --- categories ---
const cats = data.get("sm_student_categories");
console.log(`\nstudent categories (${cats.rows.length}):`);
for (const row of cats.rows) {
  console.log(`  id=${col(row, "sm_student_categories", "id")}  name=${col(row, "sm_student_categories", "category_name")}`);
}

// --- students by class ---
const students = data.get("sm_students");
const byClass = new Map();
for (const row of students.rows) {
  const classId = col(row, "sm_students", "class_id");
  const sectionId = col(row, "sm_students", "section_id");
  const key = `${classId}/${sectionId}`;
  byClass.set(key, (byClass.get(key) ?? 0) + 1);
}
console.log(`\nstudents (${students.rows.length}) by class/section:`);
for (const [k, n] of [...byClass].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);

// --- student_records flags ---
const records = data.get("student_records");
const tally = (name) => {
  const m = new Map();
  for (const row of records.rows) {
    const v = col(row, "student_records", name);
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
};
console.log(`\nstudent_records (${records.rows.length}) columns = ${records.cols.join(", ")}`);
for (const f of ["is_default", "is_promote", "is_graduate", "active_status", "session_id", "academic_id"]) {
  if (idx("student_records", f) === -1) continue;
  console.log(`  ${f}: ${[...tally(f)].map(([k, n]) => `${k || "NULL"}=${n}`).join(", ")}`);
}

// --- academic years ---
const years = data.get("sm_academic_years");
console.log(`\nacademic years (${years.rows.length}) columns = ${years.cols.join(", ")}`);
