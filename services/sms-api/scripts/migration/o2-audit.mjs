#!/usr/bin/env node
/**
 * O2 index audit: explains the hot reads against a loaded scratch D1 and
 * records whether the school_id-leading composite is present and used.
 */
import path from "node:path";
import { writeFileSync } from "node:fs";

import { queryJson } from "./load.mjs";

const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const persist = path.resolve(valueOf("--persist", ".tmp/load-a"));

const queries = [
  {
    name: "records-by-student-default",
    index: "student_records_school_academic_student_default_index",
    sql: "SELECT * FROM student_records WHERE school_id = 1 AND academic_id = 4 AND student_id = 1 AND is_default = 1 LIMIT 10"
  },
  {
    name: "marks-by-term-class-section",
    index: "sm_mark_stores_school_academic_term_class_section_index",
    sql: "SELECT * FROM sm_mark_stores WHERE school_id = 1 AND academic_id = 4 AND exam_term_id = 1 AND class_id = 12 AND section_id = 1 LIMIT 10"
  },
  {
    name: "results-by-exam-class-section",
    index: "sm_result_stores_school_academic_exam_class_section_index",
    sql: "SELECT * FROM sm_result_stores WHERE school_id = 1 AND academic_id = 4 AND exam_type_id = 1 AND class_id = 12 AND section_id = 1 LIMIT 10"
  },
  {
    name: "assignments-by-class-section",
    index: "sm_assign_subjects_school_academic_class_section_index",
    sql: "SELECT * FROM sm_assign_subjects WHERE school_id = 1 AND academic_id = 5 AND class_id = 23 AND section_id = 1 LIMIT 10"
  },
  {
    name: "class-sections-by-class-section",
    index: "sm_class_sections_school_academic_class_section_index",
    sql: "SELECT * FROM sm_class_sections WHERE school_id = 1 AND academic_id = 5 AND class_id = 23 AND section_id = 1 LIMIT 10"
  },
  {
    name: "students-by-class-section",
    index: "sm_students_school_academic_class_section_index",
    sql: "SELECT * FROM sm_students WHERE school_id = 1 AND academic_id = 4 AND class_id = 12 AND section_id = 1 LIMIT 10"
  },
  {
    name: "attendance-by-class-section",
    index: "sm_student_attendances_school_academic_class_section_index",
    sql: "SELECT * FROM sm_student_attendances WHERE school_id = 1 AND academic_id = 4 AND class_id = 12 AND section_id = 1 LIMIT 10"
  },
  {
    name: "fees-by-student",
    index: "sm_fees_assigns_school_academic_student_index",
    sql: "SELECT * FROM sm_fees_assigns WHERE school_id = 1 AND academic_id = 5 AND student_id = 1 LIMIT 10"
  },
  {
    name: "remarks-by-student-term",
    index: "teacher_remarks_academic_student_term_index",
    sql: "SELECT * FROM teacher_remarks WHERE academic_id = 4 AND student_id = 1 AND exam_type_id = 1 LIMIT 10"
  },
  {
    name: "ratings-by-student-term",
    index: "student_ratings_academic_student_term_index",
    sql: "SELECT * FROM student_ratings WHERE academic_id = 4 AND student_id = 1 AND exam_type_id = 1 LIMIT 10"
  }
];

const lines = [
  "# O2 index audit",
  "",
  `Scratch database: \`${persist}\``,
  "",
  "| Query | Expected index | Present | Plan uses it | Plan |",
  "|---|---|---|---|---|"
];
let failures = 0;
for (const query of queries) {
  const present = queryJson(
    persist,
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name = '${query.index}';`
  );
  const plan = queryJson(persist, `EXPLAIN QUERY PLAN ${query.sql};`)
    .map((row) => String(row.detail ?? ""))
    .join("; ");
  const presentFlag = present.length > 0;
  const usedFlag = plan.includes(query.index);
  if (!presentFlag) failures += 1;
  lines.push(
    `| ${query.name} | \`${query.index}\` | ${presentFlag ? "yes" : "no"} | ${usedFlag ? "yes" : "no"} | ${plan.replaceAll("|", "\\|")} |`
  );
}
lines.push("");
lines.push(failures === 0 ? "All expected O2 indexes are present." : `${failures} index(es) missing.`);
const report = `${lines.join("\n")}\n`;
writeFileSync(path.join(persist, "o2-report.md"), report);
console.log(report);
if (failures > 0) process.exit(1);
