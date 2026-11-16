#!/usr/bin/env node
/**
 * Generates 01b — the repository migration map.
 *
 * Method inventory is parsed from source (names + line numbers); destinations
 * come from an explicit override table for known cross-concern methods, with a
 * per-repository default for everything else. Hazard flags are inferred from
 * the method name and body, and are advisory: they tell the porter where to
 * look, not what to do.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = "src/lib/server/repository";
const OUT = "docs/cloudflare-port/01b-repository-migration-map.md";

/** Repository file -> default destination when no override matches. */
const DEFAULTS = {
  "auth.repo.ts": "accounts/auth",
  "parent.repo.ts": "profiles/parent/profile",
  "staff.repo.ts": "profiles/staff/profile",
  "student.repo.ts": "profiles/student/profile",
  "timeline.repo.ts": "profiles/student/timeline",
  "school.repo.ts": "school/school",
  "assignment.repo.ts": "academics/assignment",
  "result.repo.ts": "assessments/results",
  "base.repo.ts": "base/"
};

/** Methods whose destination is NOT their file's default. */
const OVERRIDES = {
  "base.repo.ts": {
    create: "base/typed-insert",
    findActiveAcademicYear: "school/academic-config",
    loadConfigurations: "school/academic-config",
    getGeneralSettings: "school/settings",
    getGeneralSettingBySchoolId: "school/settings",
    getAcademicYears: "school/academic-year",
    getActiveAcademicYear: "school/academic-year",
    getAcademicYearById: "school/academic-year",
    getAcademicId: "school/academic-year",
    getExamTypes: "assessments/exam",
    getCurrentTerm: "assessments/exam",
    withErrorHandling: "base/error-handling",
    optionalFilters: "base/filters"
  },
  "result.repo.ts": {
    upsertClassAttendance: "attendance/class-attendance",
    assignSubjects: "academics/assignment",
    getAssignedSubjects: "academics/assignment",
    getAssignedClassSection: "academics/assignment",
    getAssignedTeacher: "academics/assignment",
    getClassSectionById: "academics/class-section",
    getStudentCategories: "reference/student-category",
    getSubjectsByClass: "academics/subject",
    getExamSetupsByStaffId: "assessments/exam-setup",
    getExamSetupsByClassSection: "assessments/exam-setup",
    getExamSetup: "assessments/exam-setup",
    updateExamSetup: "assessments/exam-setup",
    upsertExamSetup: "assessments/exam-setup",
    createExamIfNotExist: "assessments/exam",
    getSubjectFullMark: "assessments/exam-setup",
    getMarkGrade: "assessments/results",
    getObjectives: "assessments/feedback",
    upsertDaycareLearningOutcome: "assessments/feedback",
    getStudentRatings: "assessments/feedback",
    getTeacherRemarks: "assessments/feedback",
    upsertStudentRatings: "assessments/feedback",
    upsertTeacherRemark: "assessments/feedback"
  },
  "student.repo.ts": {
    getClassAndSectionByName: "academics/class-section",
    searchClassSection: "academics/class-section",
    assignClassSection: "academics/class-section",
    resolveGenderId: "reference/base-setup",
    resolveStudentCategoryId: "reference/student-category",
    getStudentRegistrationOptions: "profiles/student/profile",
    promoteStudent: "service: student-lifecycle (repo keeps primitives)",
    demoteStudent: "service: student-lifecycle (repo keeps primitives)",
    getLatestPromotion: "profiles/student/lifecycle",
    getStudentBySiblings: "profiles/student/search",
    getStudentsByClassSection: "profiles/student/search",
    getStudentsByStaffId: "profiles/student/search",
    searchStudent: "profiles/student/search",
    getStudentRecord: "profiles/student/records",
    getStudentRecordByAdmissionNo: "profiles/student/records",
    createIfNotExistsStudentRecord: "profiles/student/records"
  },
  "auth.repo.ts": {
    createUser: "accounts/user"
  }
};

/** Methods whose names hint at a bulk or batching hazard. */
const BULK_HINTS = /(batch|bulk|import|promot|demot|clean|assign)/i;
const WRITE_HINTS = /(create|update|delete|upsert|insert|assign|set|save)/i;
const READ_HINTS = /^(get|find|list|search|query|read|exists|count)/i;

function hazard(name, body) {
  const flags = [];
  if (BULK_HINTS.test(name)) flags.push("bulk");
  if (body.includes("transaction(")) flags.push("transaction");
  if (body.includes("inArray(")) flags.push("chunks-binds");
  if (name.toLowerCase().includes("upsert")) flags.push("needs-batch");
  if (flags.length === 0) {
    if (WRITE_HINTS.test(name)) flags.push("write");
    else if (READ_HINTS.test(name)) flags.push("read");
    else flags.push("review");
  }
  return flags.join(", ");
}

function parseRepo(file) {
  const text = fs.readFileSync(path.join(SRC, file), "utf8");
  const lines = text.split("\n");
  const methodRe = /^\s+async\s+([A-Za-z_$][\w$]*)\s*\(/;
  const found = [];
  lines.forEach((line, i) => {
    const m = methodRe.exec(line);
    if (m) found.push({ name: m[1], line: i + 1 });
  });
  found.forEach((method, i) => {
    const end = i + 1 < found.length ? found[i + 1].line : lines.length;
    method.body = lines.slice(method.line - 1, end).join("\n");
  });
  return found;
}

const files = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith(".repo.ts"))
  .sort();

const sections = [];
let total = 0;

for (const file of files) {
  const methods = parseRepo(file);
  const defaultDest = DEFAULTS[file] ?? "review";
  const overrides = OVERRIDES[file] ?? {};
  const rows = methods.map((m) => {
    const dest = overrides[m.name] ?? defaultDest;
    return `| \`${m.name}\` | ${m.line} | ${dest} | ${hazard(m.name, m.body)} |`;
  });
  total += rows.length;
  sections.push(
    `### \`${file}\` — ${methods.length} methods\n\n` +
      `| Method | Line | Destination | Hazard |\n|---|---|---|---|\n` +
      rows.join("\n")
  );
}

const header = `# 01b — Repository Migration Map

Every method in the current repository layer, with the module it moves to under the target architecture in [01](./01-repository-layer.spec.md) and a hazard flag for the D1 port.

**Generated** by \`scripts/gen-migration-map.mjs\`. Regenerate after changing the repository layer:

\`\`\`bash
node scripts/gen-migration-map.mjs
\`\`\`

## How to read it

- **Destination** — the target folder/file from [01 §3.1](./01-repository-layer.spec.md). Where a method belongs to a service rather than a repository, it says so explicitly.
- **Hazard** — advisory, not a verdict. Flags: \`bulk\` (loops or mass writes), \`chunks-binds\` (uses \`inArray\`, must go through \`chunkedInArray\`), \`needs-batch\` (upsert that should be one statement), \`transaction\` (uses \`db.transaction\`, must be rewritten), \`read\`/\`write\`, \`review\` (no confident default).
- **Line** — location in the current file, for traceability. It will drift as Stage 1 edits land.

## Summary

| Repository | Methods | Notes |
|---|---|---|
${sections
  .map((s) => {
    const [, file, count] = /^### `([^`]+)` — (\d+) methods/.exec(s);
    return `| \`${file}\` | ${count} | |`;
  })
  .join("\n")}
| **Total** | **${total}** | |

## Destination clusters

| Destination | Receives |
|---|---|
| \`accounts/\` | users, roles, sessions, credential claim |
| \`profiles/student/\` | profile, records, lifecycle primitives, search |
| \`profiles/staff/\`, \`profiles/parent/\` | staff and guardian profiles |
| \`reference/\` | dictionaries: base setups, designations, departments, categories, locales |
| \`academics/\` | classes, sections, subjects, assignments, class-sections, timetable |
| \`assessments/\` | exams, setups, marks, results, grades, merit, feedback, homework |
| \`attendance/\` | student and class attendance |
| \`fees/\` | groups, types, masters, assignments, payments |
| \`school/\` | school, settings, academic year, academic config cache |
| \`communications/\` | chat groups, calendar, notices |
| \`base/\` | context, error handling, D1 helpers, filters, pagination |

## Cross-concern moves worth reviewing

| Current location | Move | Why |
|---|---|---|
| \`result.repo.ts\` \`upsertClassAttendance\` | \`attendance/class-attendance\` | Attendance is not an assessment concern |
| \`result.repo.ts\` \`assignSubjects\`, \`getAssignedSubjects\` | \`academics/assignment\` | Subject assignment belongs with academics |
| \`result.repo.ts\` \`getStudentCategories\` | \`reference/student-category\` | Duplicated dictionary lookup |
| \`student.repo.ts\` \`promoteStudent\`, \`demoteStudent\` | \`student-lifecycle.service\` | Orchestration plus chat-group cleanup |
| \`base.repo.ts\` config and term methods | \`school/academic-config\`, \`assessments/exam\` | Domain logic out of the base class |

## Methods

`;

fs.writeFileSync(OUT, header + sections.join("\n\n") + "\n");
console.log(`wrote ${OUT}`);
console.log(`repositories: ${files.length}, methods: ${total}`);
for (const s of sections) console.log("  " + s.split("\n")[0].replace("### ", ""));
