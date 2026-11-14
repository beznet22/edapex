#!/usr/bin/env node
/**
 * Local Phase 8 cutover drill.
 *
 * Copies the Phase 7 rehearsal D1, then exercises the application-level cutover:
 * health, claim disabled/enabled, target integrity, staffing, teacher roster,
 * marks entry/read-back, report-card review, and rollback to claim-disabled.
 *
 * The source rehearsal directory is never mutated. Production DNS/MySQL
 * rollback is a tabletop and remains a cutover-window requirement.
 *
 * Usage (from apps/api/):
 *   node scripts/cutover/drill.mjs --persist .tmp/rehearsal-a \
 *     --out .tmp/cutover-drill [--port 8795]
 */
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import { executeSql, queryJson } from "../migration/load.mjs";
import { mintAdminSession, mintSession, sha256Hex } from "../migration/session.mjs";
import {
  DrillError,
  assertCoreCountsUnchanged,
  expectStatus,
  expectTrue,
  normalizeCategory
} from "./drill-assertions.mjs";
import { request, startWorker, stopWorker, waitForHealth } from "./drill-http.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const TARGET_ACADEMIC_ID = 5;
const CLAIM_PASSWORD = "edapex-cutover-drill";
const CLAIM_DIGEST = sha256Hex(CLAIM_PASSWORD);
const COOKIE_SECRET = "cutover-drill-cookie-secret";
const KNOWN_EMAIL = "drill-known@example.test";
const DUPLICATE_EMAIL = "drill-duplicate@example.test";
const UNKNOWN_EMAIL = "drill-unknown@example.test";
const CORE_TABLES = [
  "sm_students",
  "student_records",
  "sm_classes",
  "sm_sections",
  "sm_class_sections",
  "sm_assign_subjects",
  "sm_academic_years"
];
const CATEGORIES = new Set([
  "NURSERY",
  "GRADEK",
  "LOWERBASIC",
  "MIDDLEBASIC",
  "UPPERBASIC"
]);
const MARKS_BY_CATEGORY = {
  NURSERY: { CA: 20, ORAL: 3, PSYCHO: 3, HW: 5, EXAM: 30 },
  GRADEK: { CA1: 10, CA2: 10, HW: 1, REPORT: 2, PSYCHO: 2, EXAM: 30 },
  LOWERBASIC: { MTA: 20, CA: 8, REPORT: 8, EXAM: 30 },
  MIDDLEBASIC: { MTA: 20, CA: 8, REPORT: 8, EXAM: 30 },
  UPPERBASIC: { MTA: 20, CA: 8, REPORT: 8, EXAM: 30 }
};

const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const source = path.resolve(valueOf("--persist", ".tmp/rehearsal-a"));
const out = path.resolve(valueOf("--out", ".tmp/cutover-drill"));
const port = Number(valueOf("--port", "8795"));

const tmpRoot = path.resolve(APP_ROOT, ".tmp");
if (!out.startsWith(`${tmpRoot}${path.sep}`)) {
  throw new DrillError(`Drill output must be a child of ${tmpRoot}`);
}
if (
  out === source ||
  out.startsWith(`${source}${path.sep}`) ||
  source.startsWith(`${out}${path.sep}`)
) {
  throw new DrillError("Drill output and source rehearsal directory must not contain each other");
}
const sourceEvidencePath = path.join(source, "evidence.json");
if (!existsSync(sourceEvidencePath)) {
  throw new DrillError(`Source rehearsal evidence not found: ${sourceEvidencePath}`);
}

const sourceEvidenceRaw = readFileSync(sourceEvidencePath);
const sourceEvidenceHash = sha256Hex(sourceEvidenceRaw);
const sourceEvidence = JSON.parse(sourceEvidenceRaw.toString("utf8"));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const drillD1 = path.join(out, "d1");
cpSync(source, drillD1, { recursive: true });

const startedAt = Math.floor(Date.now() / 1000);
const evidence = {
  status: "running",
  startedAt,
  sourcePersist: source,
  sourceEvidenceSha256: sourceEvidenceHash,
  drillD1,
  steps: {},
  coreCounts: {},
  limitations: [
    "Production DNS/route reversion not exercised.",
    "Source MySQL read-only state and password-backup restore not exercised.",
    "Claim ticket completion through Google is covered by the Phase 5 suite, not this drill."
  ]
};
let worker = null;

function log(message) {
  console.log(`[cutover-drill] ${message}`);
}

async function stopPhase() {
  if (worker === null) return;
  await stopWorker(worker);
  worker = null;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function snapshotCounts(persist) {
  const counts = {};
  for (const table of CORE_TABLES) {
    const rows = queryJson(persist, `SELECT COUNT(*) AS count FROM "${table}";`);
    counts[table] = Number(rows[0]?.count ?? -1);
  }
  return counts;
}

function insertDrillUsers(persist) {
  const now = Math.floor(Date.now() / 1000);
  const insert = (name, email) =>
    `INSERT INTO users (full_name, email, password, usertype, active_status, school_id, is_administrator, claim_status, created_at, updated_at) ` +
    `VALUES (${sqlText(name)}, ${sqlText(email)}, ${sqlText(CLAIM_DIGEST)}, 'parent', 0, 1, 'no', 'pending', ${now}, ${now});`;
  executeSql(persist, insert("Cutover Drill Known", KNOWN_EMAIL));
  executeSql(persist, insert("Cutover Drill Duplicate A", DUPLICATE_EMAIL));
  executeSql(persist, insert("Cutover Drill Duplicate B", DUPLICATE_EMAIL));
}

function selectDrillPlacement(persist) {
  const rows = queryJson(
    persist,
    `SELECT u.id AS teacher_user_id, a.class_id, a.section_id, a.subject_id,
            s.id AS student_id, sr.id AS record_id, c.category_name
       FROM sm_assign_subjects a
       JOIN sm_staffs st ON st.id = a.teacher_id
       JOIN users u ON u.id = st.user_id
       JOIN student_records sr
         ON sr.academic_id = a.academic_id
        AND sr.class_id = a.class_id
        AND sr.section_id = a.section_id
        AND sr.is_default = 1
       JOIN sm_students s ON s.id = sr.student_id
       JOIN sm_student_categories c ON c.id = s.student_category_id
      WHERE a.academic_id = ${TARGET_ACADEMIC_ID}
        AND a.active_status = 1
        AND u.active_status = 1
        AND upper(replace(c.category_name, ' ', '')) IN
            ('NURSERY', 'GRADEK', 'LOWERBASIC', 'MIDDLEBASIC', 'UPPERBASIC')
      ORDER BY a.class_id, a.section_id, s.id
      LIMIT 1;`
  );
  if (rows.length === 0) {
    throw new DrillError("No target-session teacher/student placement with a numeric category was found");
  }
  const row = rows[0];
  return {
    teacherUserId: Number(row.teacher_user_id),
    classId: Number(row.class_id),
    sectionId: Number(row.section_id),
    subjectId: Number(row.subject_id),
    studentId: Number(row.student_id),
    recordId: Number(row.record_id),
    category: normalizeCategory(String(row.category_name))
  };
}

async function main() {
  log(`copying ${source} to ${drillD1}`);
  insertDrillUsers(drillD1);
  const admin = mintAdminSession(drillD1, true);
  const placement = selectDrillPlacement(drillD1);
  expectTrue(
    CATEGORIES.has(placement.category),
    `Unsupported drill category: ${placement.category}`
  );
  const teacher = mintSession(drillD1, placement.teacherUserId, true);
  const before = snapshotCounts(drillD1);
  evidence.coreCounts.before = before;

  const adminHeaders = {
    Cookie: admin.cookie,
    "X-Academic-Id": String(TARGET_ACADEMIC_ID)
  };
  const teacherHeaders = {
    Cookie: teacher.cookie,
    "X-Academic-Id": String(TARGET_ACADEMIC_ID),
    "X-Class-Id": String(placement.classId),
    "X-Section-Id": String(placement.sectionId)
  };

  log("phase 1: claim disabled, integrity, staffing, roster, marks, report card");
  worker = startWorker({
    appRoot: APP_ROOT,
    persist: drillD1,
    port,
    claimEnabled: false,
    digest: CLAIM_DIGEST,
    cookieSecret: COOKIE_SECRET,
    logFile: path.join(out, "worker-disabled.log")
  });
  await waitForHealth(worker);
  const health = await request(worker.baseUrl, "/health");
  expectStatus(health, 200, "health");
  evidence.steps.health = health.status;

  let response = await request(worker.baseUrl, "/api/v1/auth/claim", {
    method: "POST",
    headers: { "x-forwarded-for": "10.10.0.1" },
    body: { email: KNOWN_EMAIL, password: CLAIM_PASSWORD }
  });
  expectStatus(response, 404, "claim disabled");
  evidence.steps.claimDisabled = response.status;

  response = await request(
    worker.baseUrl,
    `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/integrity`,
    { headers: adminHeaders }
  );
  expectStatus(response, 200, "target integrity");
  const integrity = response.json;
  expectTrue(integrity?.gate === "green", "target integrity gate is not green");
  expectTrue(
    integrity?.readiness?.unreviewedSections === 0,
    "target still has unreviewed sections"
  );
  const expectedCurrent = Number(
    sourceEvidence?.integrityTarget?.readiness?.targetCurrentRecords ?? -1
  );
  expectTrue(expectedCurrent > 0, "source evidence has no target current-record count");
  expectTrue(
    integrity?.readiness?.targetCurrentRecords === expectedCurrent,
    `target current records ${integrity?.readiness?.targetCurrentRecords} != ${expectedCurrent}`
  );
  evidence.steps.integrity = {
    gate: integrity.gate,
    unreviewedSections: integrity.readiness.unreviewedSections,
    targetCurrentRecords: integrity.readiness.targetCurrentRecords
  };

  response = await request(
    worker.baseUrl,
    `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/staffing`,
    { headers: adminHeaders }
  );
  expectStatus(response, 200, "target staffing");
  const sections = response.json?.sections;
  expectTrue(Array.isArray(sections), "staffing response has no sections");
  const expectedSections = Number(sourceEvidence?.staffing?.beforeSections ?? -1);
  if (expectedSections > 0) {
    expectTrue(
      sections.length === expectedSections,
      `staffing sections ${sections.length} != ${expectedSections}`
    );
  }
  evidence.steps.staffingSections = sections.length;

  response = await request(worker.baseUrl, "/api/v1/settings/exam-types", {
    headers: adminHeaders
  });
  expectStatus(response, 200, "exam types");
  const examTypes = response.json?.examTypes;
  expectTrue(Array.isArray(examTypes) && examTypes.length > 0, "no exam types returned");
  const firstTerm =
    examTypes.find((entry) => entry.name === "FIRST TERM" && entry.sequence === 1) ??
    examTypes.find((entry) => entry.activeStatus === 1);
  expectTrue(firstTerm !== undefined, "no active exam type found");
  expectTrue(
    firstTerm.startsOn === "2026-09-14" && firstTerm.endsOn === "2026-12-11",
    `FIRST TERM dates are ${firstTerm.startsOn} -> ${firstTerm.endsOn}`
  );
  evidence.steps.firstTerm = {
    name: firstTerm.name,
    startsOn: firstTerm.startsOn,
    endsOn: firstTerm.endsOn,
    status: firstTerm.status
  };
  const examTypeId = Number(firstTerm.id);

  response = await request(worker.baseUrl, "/api/v1/students?limit=5", {
    headers: teacherHeaders
  });
  expectStatus(response, 200, "teacher roster");
  expectTrue(
    Array.isArray(response.json?.rows) && response.json.rows.length > 0,
    "teacher roster is empty"
  );
  evidence.steps.rosterRows = response.json.rows.length;

  const marks = MARKS_BY_CATEGORY[placement.category];
  expectTrue(marks !== undefined, `no drill marks for ${placement.category}`);
  response = await request(worker.baseUrl, "/api/v1/assessments/results", {
    method: "PUT",
    headers: teacherHeaders,
    body: {
      studentData: {
        studentId: placement.studentId,
        classId: placement.classId,
        sectionId: placement.sectionId,
        recordId: placement.recordId,
        examTypeId,
        studentCategory: placement.category
      },
      marksData: [{ subjectId: placement.subjectId, marks }]
    }
  });
  expectStatus(response, 200, "marks entry");
  const gradeRows = queryJson(
    drillD1,
    `SELECT total_gpa_grade, total_marks
       FROM sm_result_stores
      WHERE student_id = ${placement.studentId}
        AND exam_type_id = ${examTypeId}
        AND academic_id = ${TARGET_ACADEMIC_ID}
        AND total_gpa_grade IS NOT NULL
        AND total_gpa_grade <> ''
      LIMIT 1;`
  );
  expectTrue(gradeRows.length > 0, "marks entry produced no grade");
  evidence.steps.marks = {
    category: placement.category,
    subjectId: placement.subjectId,
    gradePresent: true
  };

  response = await request(
    worker.baseUrl,
    `/api/v1/assessments/results/${placement.studentId}/${examTypeId}?byAdmission=false&withImages=false`,
    { headers: teacherHeaders }
  );
  expectStatus(response, 200, "result read-back");
  expectTrue(
    Number(response.json?.student?.id) === placement.studentId,
    "result read-back returned a different student"
  );

  response = await request(
    worker.baseUrl,
    `/api/v1/students/${placement.studentId}/marksheets/${examTypeId}/review`,
    { method: "POST", headers: teacherHeaders, body: {} }
  );
  expectStatus(response, 200, "report-card review");
  expectTrue(response.json?.status === "reviewed", "report-card review status is not reviewed");
  expectTrue(
    typeof response.json?.checksum === "string" && response.json.checksum.length === 64,
    "report-card review returned no checksum"
  );
  evidence.steps.reportCard = {
    status: response.json.status,
    checksumPrefix: response.json.checksum.slice(0, 12)
  };

  await stopPhase();

  log("phase 2: claim enabled");
  worker = startWorker({
    appRoot: APP_ROOT,
    persist: drillD1,
    port,
    claimEnabled: true,
    digest: CLAIM_DIGEST,
    cookieSecret: COOKIE_SECRET,
    logFile: path.join(out, "worker-enabled.log")
  });
  await waitForHealth(worker);

  response = await request(worker.baseUrl, "/api/v1/auth/claim", {
    method: "POST",
    headers: { "x-forwarded-for": "10.10.1.1" },
    body: { email: KNOWN_EMAIL, password: CLAIM_PASSWORD }
  });
  expectStatus(response, 202, "known claim");
  const claimCookie = response.headers.get("set-cookie");
  expectTrue(
    claimCookie !== null && claimCookie.includes("__Host-edapex_claim="),
    "known claim did not set the claim ticket cookie"
  );

  response = await request(worker.baseUrl, "/api/v1/auth/claim", {
    method: "POST",
    headers: { "x-forwarded-for": "10.10.1.2" },
    body: { email: UNKNOWN_EMAIL, password: CLAIM_PASSWORD }
  });
  expectStatus(response, 202, "unknown claim");
  expectTrue(
    response.headers.get("set-cookie") === null,
    "unknown claim unexpectedly set a cookie"
  );

  response = await request(worker.baseUrl, "/api/v1/auth/claim", {
    method: "POST",
    headers: { "x-forwarded-for": "10.10.1.3" },
    body: { email: DUPLICATE_EMAIL, password: CLAIM_PASSWORD }
  });
  expectStatus(response, 409, "ambiguous claim");
  expectTrue(
    response.text.includes("AMBIGUOUS_EMAIL"),
    "ambiguous claim did not return AMBIGUOUS_EMAIL"
  );
  evidence.steps.claimEnabled = {
    known: 202,
    unknown: 202,
    ambiguous: 409
  };

  await stopPhase();

  log("phase 3: rollback to claim disabled");
  worker = startWorker({
    appRoot: APP_ROOT,
    persist: drillD1,
    port,
    claimEnabled: false,
    digest: CLAIM_DIGEST,
    cookieSecret: COOKIE_SECRET,
    logFile: path.join(out, "worker-rollback.log")
  });
  await waitForHealth(worker);

  response = await request(worker.baseUrl, "/api/v1/auth/claim", {
    method: "POST",
    headers: { "x-forwarded-for": "10.10.2.1" },
    body: { email: KNOWN_EMAIL, password: CLAIM_PASSWORD }
  });
  expectStatus(response, 404, "claim after rollback");

  response = await request(
    worker.baseUrl,
    `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/integrity`,
    { headers: adminHeaders }
  );
  expectStatus(response, 200, "admin integrity after rollback");
  evidence.steps.rollback = { claim: 404, admin: 200 };

  await stopPhase();

  const after = snapshotCounts(drillD1);
  assertCoreCountsUnchanged(before, after, new Set());
  evidence.coreCounts.after = after;
  evidence.status = "passed";
}

try {
  await main();
} catch (error) {
  evidence.status = "failed";
  evidence.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await stopPhase();
  evidence.finishedAt = Math.floor(Date.now() / 1000);
  const afterHash = sha256Hex(readFileSync(sourceEvidencePath));
  evidence.sourceEvidenceSha256After = afterHash;
  if (afterHash !== sourceEvidenceHash) {
    evidence.status = "failed";
    evidence.error = "Source rehearsal evidence changed during the drill";
  }
  writeFileSync(path.join(out, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  log(`evidence: ${path.join(out, "evidence.json")}`);
}
