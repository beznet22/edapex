#!/usr/bin/env node
/**
 * Integrity audit over the remote dump.
 *
 * Checks the invariants a "fresh session" must satisfy before bootstrap:
 * every profile has a user, every user has a profile, every student has a
 * parent, every parent has a child, every student has exactly one current
 * record, and year-scoped references agree with the year of their parent row.
 *
 * Read-only: parses the dump, never writes to a database.
 */
import fs from "node:fs";

const FILE = process.argv[2] ?? "edapexdb.sql";

const TABLES = [
  "users",
  "sm_students",
  "sm_parents",
  "sm_staffs",
  "student_records",
  "sm_classes",
  "sm_sections",
  "sm_exams",
  "sm_exam_setups",
  "sm_mark_stores",
  "sm_assign_subjects",
  "sm_class_teachers"
];

function parseDump(path) {
  const lines = fs.readFileSync(path, "utf8").split("\n");
  const out = new Map(TABLES.map((t) => [t, { cols: [], rows: [] }]));
  let current = null;

  const clean = (line) =>
    line
      .replace(/^\s*\(/, "")
      .replace(/\),?$/, "")
      .replace(/\);$/, "")
      .split("\t")
      .map((x) => { const v = x.trim().replace(/,$/, ""); return v === "NULL" ? null : v; });

  for (const line of lines) {
    const header = /^INSERT INTO `([^`]+)` \(([^)]*)\) VALUES/.exec(line);
    if (header) {
      const table = header[1];
      if (!out.has(table)) {
        current = null;
        continue;
      }
      current = out.get(table);
      current.cols = header[2].split(",").map((c) => c.trim().replace(/`/g, ""));
      continue;
    }
    if (!current) continue;
    if (!line.startsWith("(")) {
      current = null;
      continue;
    }
    current.rows.push(clean(line));
    if (line.endsWith(");")) current = null;
  }
  return out;
}

const db = parseDump(FILE);
const rows = (t) => db.get(t)?.rows ?? [];
const idx = (t, name) => db.get(t).cols.indexOf(name);
const val = (row, t, name) => row[idx(t, name)];
const ids = (t) => new Set(rows(t).map((r) => val(r, t, "id")));

const userRows = rows("users");
const users = new Map(userRows.map((r) => [val(r, "users", "id"), r]));
const students = rows("sm_students");
const parents = rows("sm_parents");
const staffs = rows("sm_staffs");
const records = rows("student_records");

const studentIds = ids("sm_students");
const parentIds = ids("sm_parents");

const findings = [];
const add = (id, label, list, fix) =>
  findings.push({ id, label, count: list.length, sample: list.slice(0, 5).map((x) => Array.isArray(x) ? x[0] : String(x)), fix });

// --- profile <-> user ---
const studentsWithoutUser = students.filter((r) => {
  const u = val(r, "sm_students", "user_id");
  return !u || !users.has(u);
});
const staffWithoutUser = staffs.filter((r) => {
  const u = val(r, "sm_staffs", "user_id");
  return !u || !users.has(u);
});
const parentsWithoutUser = parents.filter((r) => {
  const u = val(r, "sm_parents", "user_id");
  return !u || !users.has(u);
});
add("P1", "students with no valid user", studentsWithoutUser, "Create a user or link the student to an existing one");
add("P2", "staff with no valid user", staffWithoutUser, "Create a user or link the staff row");
add("P3", "parents with no valid user", parentsWithoutUser, "Create a user or link the parent row");

const profileUserIds = new Set(
  [...students, ...staffs, ...parents].map((r, i) => {
    const table = i < students.length ? "sm_students" : i < students.length + staffs.length ? "sm_staffs" : "sm_parents";
    return val(r, table, "user_id");
  })
);
const usersWithoutProfile = userRows.filter(
  (r) => !profileUserIds.has(val(r, "users", "id")) && val(r, "users", "is_administrator") !== "1"
);
add("P4", "users with no profile (non-admin)", usersWithoutProfile, "Link to a profile or mark as administrator");

// --- student <-> parent ---
const studentsWithoutParent = students.filter((r) => {
  const p = val(r, "sm_students", "parent_id");
  return !p || !parentIds.has(p);
});
add("F1", "students with no valid parent", studentsWithoutParent, "Link each student to a parent row");

const childrenByParent = new Map();
for (const r of students) {
  const p = val(r, "sm_students", "parent_id");
  if (!p) continue;
  childrenByParent.set(p, (childrenByParent.get(p) ?? 0) + 1);
}
const parentsWithoutChildren = parents.filter((r) => !childrenByParent.has(val(r, "sm_parents", "id")));
add("F2", "parents with no child", parentsWithoutChildren, "Remove the parent row or attach the child");

// --- student <-> record ---
const recordCountByStudent = new Map();
const defaultsByStudent = new Map();
for (const r of records) {
  const sid = val(r, "student_records", "student_id");
  recordCountByStudent.set(sid, (recordCountByStudent.get(sid) ?? 0) + 1);
  if (val(r, "student_records", "is_default") === "1") {
    defaultsByStudent.set(sid, (defaultsByStudent.get(sid) ?? 0) + 1);
  }
}
const studentsWithoutRecord = students.filter((r) => !recordCountByStudent.has(val(r, "sm_students", "id")));
const studentsWithoutDefault = students.filter((r) => !defaultsByStudent.has(val(r, "sm_students", "id")));
const studentsWithMultiDefault = [...defaultsByStudent].filter(([, n]) => n > 1);
add("R1", "students with no student_record", studentsWithoutRecord, "Create the current-year record during promotion");
add("R2", "students with no default record", studentsWithoutDefault, "Set exactly one is_default row");
add("R3", "students with multiple default records", studentsWithMultiDefault, "Keep the newest, clear the rest");

const recordsWithoutStudent = records.filter((r) => !studentIds.has(val(r, "student_records", "student_id")));
add("R4", "student_records pointing at a missing student", recordsWithoutStudent, "Delete or re-link the orphan record");

// --- year consistency ---
const classYear = new Map(rows("sm_classes").map((r) => [val(r, "sm_classes", "id"), val(r, "sm_classes", "academic_id")]));
const recordYearMismatch = records.filter((r) => {
  const c = val(r, "student_records", "class_id");
  const y = val(r, "student_records", "academic_id");
  return c && classYear.has(c) && classYear.get(c) !== y;
});
add("Y1", "records whose class belongs to another academic year", recordYearMismatch, "Re-point class_id or correct academic_id");

const examRows = rows("sm_exams");
const examYear = new Map(examRows.map((r) => [val(r, "sm_exams", "id"), val(r, "sm_exams", "academic_id")]));
const setupYearMismatch = rows("sm_exam_setups").filter((r) => {
  const e = val(r, "sm_exam_setups", "exam_id");
  const y = val(r, "sm_exam_setups", "academic_id");
  return e && examYear.has(e) && examYear.get(e) !== y;
});
add("Y2", "exam setups whose exam belongs to another year", setupYearMismatch, "Re-point exam_id or correct academic_id");

const setupIds = ids("sm_exam_setups");
const marksWithoutSetup = rows("sm_mark_stores").filter((r) => {
  const s = val(r, "sm_mark_stores", "exam_setup_id");
  return s && !setupIds.has(s);
});
add("Y3", "marks whose exam_setup is missing", marksWithoutSetup, "Quarantine — do not archive silently");

// --- duplicates ---
const byUser = new Map();
for (const r of parents) {
  const u = val(r, "sm_parents", "user_id");
  if (!u) continue;
  byUser.set(u, (byUser.get(u) ?? 0) + 1);
}
add("D1", "parent rows sharing one user", [...byUser].filter(([, n]) => n > 1).map(([u]) => u), "Dedupe to one parent row per user");

const byEmail = new Map();
for (const r of userRows) {
  const e = (val(r, "users", "email") ?? "").toLowerCase();
  if (!e) continue;
  byEmail.set(e, (byEmail.get(e) ?? 0) + 1);
}
add("D2", "user accounts sharing one email", [...byEmail].filter(([, n]) => n > 1).map(([e]) => e), "Resolve manually in the admin utility");

// --- assignments ---
const assignRows = rows("sm_assign_subjects");
const studentsWithClass = students.filter((r) => val(r, "sm_students", "class_id"));
add(
  "C1",
  "students with a class on sm_students",
  studentsWithClass,
  "Placement normally lives in student_records; backfill before promotion"
);
add("C2", "subject assignments in the source year", assignRows, "Must be copied into the new session or teachers see nothing");

const report = [
  "| ID | Invariant | Violations | Sample | Resolution |",
  "|---|---|---|---|---|",
  ...findings.map(
    (f) =>
      `| ${f.id} | ${f.label} | ${f.count} | ${f.sample.join(", ") || "—"} | ${f.fix} |`
  )
];

console.log(report.join("\n"));

const out = `# Integrity audit\n\nSource: \`${FILE}\`\n\n${report.join("\n")}\n`;
fs.writeFileSync(".kimchi/docs/integrity-report.md", out);
console.log("\nwrote .kimchi/docs/integrity-report.md");
