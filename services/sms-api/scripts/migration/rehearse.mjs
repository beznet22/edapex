#!/usr/bin/env node
/**
 * Phase 7 rehearsal.
 *
 * Fresh local D1 -> transform/load -> Worker -> bootstrap -> staffing review ->
 * activation -> archive 1,2,4 -> promotion -> quarantine -> photos/timelines ->
 * evidence.json. The run is local-only; no remote D1/R2 call is made.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  FIRST_TERM,
  SOURCE_ACADEMIC_ID,
  TARGET_ACADEMIC_ID,
  TARGET_SESSION
} from "./calendar.mjs";
import { readDump } from "./dump-reader.mjs";
import {
  applyMigrations,
  countTable,
  foreignKeyCheck,
  loadTierFiles,
  queryJson
} from "./load.mjs";
import { ensureBucket, inventoryPhotos, putObject, uploadPhotos } from "./photos.mjs";
import { mintAdminSession } from "./session.mjs";
import { writeTierFiles } from "./sql-writer.mjs";
import { LEGACY_TABLES, UPPER_BASIC_CLASSES } from "./tables.mjs";
import { readTargetModel } from "./target-schema.mjs";
import { transformDump } from "./transform/index.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);

const source = path.resolve(valueOf("--source", "../../edapexdb.sql"));
const runId = valueOf("--run-id", "a");
const persist = path.resolve(valueOf("--persist", `.tmp/rehearsal-${runId}`));
const photosMode = valueOf("--photos", has("--smoke") ? "skip" : "sample");
const sessionsArg = valueOf("--sessions", has("--smoke") ? "" : "1,2,4");
const skipArchive = has("--skip-archive") || sessionsArg.length === 0;
const digest = valueOf("--digest", "a".repeat(64));
const port = Number(valueOf("--port", runId === "b" ? "8791" : "8790"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

let worker = null;
let session = null;
let baseUrl = "";

function log(message) {
  console.log(`[${runId}] ${message}`);
}

function startWorker() {
  const logFile = path.join(persist, "worker.log");
  const stream = createWriteStream(logFile);
  const child = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--local",
      "--persist-to",
      persist,
      "--port",
      String(port),
      "--inspector-port",
      String(port + 400)
    ],
    {
      cwd: APP_ROOT,
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true
    }
  );
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  return { child, logFile };
}

async function waitForHealth(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // Worker not listening yet.
    }
    if (worker?.child.exitCode !== null) {
      throw new Error(`wrangler dev exited with ${worker?.child.exitCode}`);
    }
    await sleep(500);
  }
  throw new Error("Timed out waiting for /health");
}

async function stopWorker() {
  if (worker === null) return;
  const pid = worker.child.pid;
  const signalGroup = (signal) => {
    if (pid === undefined) return;
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        worker?.child.kill(signal);
      } catch {
        // Already gone.
      }
    }
  };
  signalGroup("SIGTERM");
  const deadline = Date.now() + 10_000;
  while (worker.child.exitCode === null && Date.now() < deadline) await sleep(200);
  if (worker.child.exitCode === null) signalGroup("SIGKILL");
  worker = null;
  await sleep(500);
}

async function api(pathname, options = {}) {
  const headers = {
    Cookie: session.cookie,
    "X-Academic-Id": String(options.academicId ?? SOURCE_ACADEMIC_ID)
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${pathname} -> ${response.status}: ${text.slice(0, 800)}`);
  }
  if (options.raw === true) return { text, headers: response.headers };
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function pollJob(jobId, academicId, timeoutMs = 20 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await api(`/api/v1/admin/jobs/${jobId}/resume`, {
      method: "POST",
      academicId
    });
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return job;
    }
    if (Date.now() > deadline) throw new Error(`Job ${jobId} timed out`);
    await sleep(350);
  }
}

function bootstrapBody(activate) {
  return {
    newSession: {
      id: TARGET_SESSION.id,
      year: TARGET_SESSION.year,
      title: TARGET_SESSION.title,
      startsOn: TARGET_SESSION.startsOn,
      endsOn: TARGET_SESSION.endsOn
    },
    copyFromSessionId: SOURCE_ACADEMIC_ID,
    terms: [{ ...FIRST_TERM }],
    classes: {
      copyFromSource: true,
      add: UPPER_BASIC_CLASSES.map((entry) => ({
        name: entry.name,
        stage: entry.stage,
        sortOrder: entry.sortOrder
      }))
    },
    copy: [
      "sections",
      "classSections",
      "subjects",
      "subjectAssignments",
      "classTeachers",
      "routines",
      "gradeBands",
      "studentCategories",
      "feeStructures"
    ],
    activate,
    dryRun: false,
    allowNonEmpty: false,
    force: false,
    allowUnreviewedStaffing: false
  };
}

async function bootstrapFlow() {
  log("bootstrap dry-run");
  const dry = await api("/api/v1/admin/sessions/bootstrap", {
    method: "POST",
    academicId: SOURCE_ACADEMIC_ID,
    body: { ...bootstrapBody(false), dryRun: true }
  });
  log("bootstrap real");
  const started = await api("/api/v1/admin/sessions/bootstrap", {
    method: "POST",
    academicId: SOURCE_ACADEMIC_ID,
    body: bootstrapBody(false)
  });
  const job = await pollJob(started.id, SOURCE_ACADEMIC_ID);
  if (job.status !== "completed") {
    throw new Error(`Bootstrap failed: ${job.error ?? job.status}`);
  }
  return { dry, job };
}

async function staffingFlow() {
  log("staffing review");
  const before = await api(`/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/staffing`, {
    academicId: TARGET_ACADEMIC_ID
  });
  const accepted = await api(
    `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/staffing/accept-copied`,
    { method: "POST", academicId: TARGET_ACADEMIC_ID }
  );
  let sections = (
    await api(`/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/staffing`, {
      academicId: TARGET_ACADEMIC_ID
    })
  ).sections;
  const fixtureSource =
    sections.find((section) => section.className === "MIDDLE BASIC 6" && section.assignments.length > 0) ??
    sections.find((section) => section.assignments.length > 0) ??
    null;
  const fixtureAssignments = (fixtureSource?.assignments ?? [])
    .filter((assignment) => assignment.staffId !== null)
    .map((assignment) => ({
      subjectId: assignment.subjectId,
      staffId: assignment.staffId
    }));
  const fixtureClassTeacher = fixtureSource?.classTeacher?.staffId ?? null;

  let reviewed = 0;
  for (const section of sections.filter((row) => row.staffingStatus !== "reviewed")) {
    const own = section.assignments
      .filter((assignment) => assignment.staffId !== null)
      .map((assignment) => ({
        subjectId: assignment.subjectId,
        staffId: assignment.staffId
      }));
    const assignments = own.length > 0 ? own : fixtureAssignments;
    const noSubjects = assignments.length === 0;
    await api(
      `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/classes/${section.classId}/sections/${section.sectionId}/staffing`,
      {
        method: "PUT",
        academicId: TARGET_ACADEMIC_ID,
        body: {
          classTeacherId: section.classTeacher?.staffId ?? fixtureClassTeacher,
          assignments,
          noSubjects
        }
      }
    );
    reviewed += 1;
  }

  sections = (
    await api(`/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/staffing`, {
      academicId: TARGET_ACADEMIC_ID
    })
  ).sections;
  const remaining = sections.filter((section) => section.staffingStatus !== "reviewed");
  const integrity = await api(
    `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/integrity`,
    { academicId: TARGET_ACADEMIC_ID }
  );
  if (remaining.length > 0 || integrity.readiness.unreviewedSections > 0) {
    throw new Error(
      `Staffing review incomplete: ${remaining.length} section(s), ` +
        `${integrity.readiness.unreviewedSections} reported`
    );
  }
  return {
    beforeSections: before.sections.length,
    accepted,
    reviewed,
    fixtureAssignments: fixtureAssignments.length,
    remaining: remaining.length,
    integrity
  };
}

async function activateFlow() {
  log("activation");
  const started = await api("/api/v1/admin/sessions/bootstrap", {
    method: "POST",
    academicId: SOURCE_ACADEMIC_ID,
    body: bootstrapBody(true)
  });
  const job = await pollJob(started.id, SOURCE_ACADEMIC_ID);
  if (job.status !== "completed") {
    throw new Error(`Activation bootstrap failed: ${job.error ?? job.status}`);
  }
  const active = queryJson(
    persist,
    "SELECT id FROM sm_academic_years WHERE active_status = 1;"
  );
  const activeId = Number(active[0]?.id ?? 0);
  if (activeId !== TARGET_ACADEMIC_ID) {
    throw new Error(`Active year is ${activeId}, expected ${TARGET_ACADEMIC_ID}`);
  }
  return { job, activeId };
}

async function archiveFlow(sessions) {
  log(`archive sessions ${sessions.join(",")}`);
  const evidence = [];
  for (const sessionId of sessions) {
    const started = await api(`/api/v1/admin/sessions/${sessionId}/archive`, {
      method: "POST",
      academicId: SOURCE_ACADEMIC_ID,
      body: { purge: true, dryRun: false }
    });
    const job = await pollJob(started.id, SOURCE_ACADEMIC_ID);
    if (job.status !== "completed") {
      throw new Error(`Archive session ${sessionId} failed: ${job.error ?? job.status}`);
    }
    const status = await api(`/api/v1/admin/sessions/${sessionId}/archive/status`, {
      academicId: SOURCE_ACADEMIC_ID
    });
    const manifest = await api(`/api/v1/admin/sessions/${sessionId}/archive/manifest`, {
      academicId: SOURCE_ACADEMIC_ID
    });
    evidence.push({
      sessionId,
      status: status.status,
      objects: status.objects,
      summaries: status.summaries,
      manifestObjects: manifest.objects?.length ?? 0,
      gaps: manifest.gaps?.length ?? 0,
      jobResult: job.result ?? null
    });
  }
  const ids = sessions.join(",");
  const live = {};
  for (const table of [
    "sm_mark_stores",
    "sm_result_stores",
    "student_ratings",
    "teacher_remarks",
    "class_attendances",
    "sm_student_attendances"
  ]) {
    live[table] = Number(
      queryJson(
        persist,
        `SELECT COUNT(*) AS count FROM ${table} WHERE academic_id IN (${ids});`
      )[0]?.count ?? 0
    );
  }
  return { sessions: evidence, live };
}

async function promotionFlow() {
  log("promotion dry-run");
  const dry = await api(`/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/promote`, {
    method: "POST",
    academicId: TARGET_ACADEMIC_ID,
    body: { dryRun: true, outcomeForMissing: "quarantine" }
  });
  const recordsYear4 = Number(
    queryJson(
      persist,
      "SELECT COUNT(*) AS count FROM student_records WHERE academic_id = 4;"
    )[0]?.count ?? 0
  );
  const uniqueDefault = Number(
    queryJson(
      persist,
      "SELECT COUNT(*) AS count FROM student_records WHERE academic_id = 4 AND is_default = 1;"
    )[0]?.count ?? 0
  );
  log("promotion real");
  const started = await api(`/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/promote`, {
    method: "POST",
    academicId: TARGET_ACADEMIC_ID,
    body: { dryRun: false, outcomeForMissing: "quarantine" }
  });
  const job = await pollJob(started.id, TARGET_ACADEMIC_ID);
  if (job.status !== "completed") {
    throw new Error(`Promotion failed: ${job.error ?? job.status}`);
  }
  const csv = await api(
    `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/promotion/quarantine.csv`,
    { academicId: TARGET_ACADEMIC_ID, raw: true }
  );
  const csvRows = Math.max(0, csv.text.trim().split("\n").length - 1);
  const document = await api(
    `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/promotion/quarantine.pdf`,
    { academicId: TARGET_ACADEMIC_ID }
  );
  const integrity = await api(
    `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/integrity`,
    { academicId: TARGET_ACADEMIC_ID }
  );
  const expected = {
    promoted: 639,
    daycare: 24,
    unplaced: 3,
    noCurrentRecord: 234,
    targetRecords: 663,
    quarantine: 237
  };
  const actual = {
    promoted: Number(job.result?.counts?.promoted ?? 0),
    daycare: Number(job.result?.counts?.daycare ?? 0),
    unplaced: Number(job.result?.counts?.unplaced ?? 0),
    noCurrentRecord: Number(job.result?.counts?.noCurrentRecord ?? 0),
    targetRecords: Number(job.result?.counts?.targetRecords ?? 0),
    quarantine: csvRows
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Promotion counts differ: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
  return {
    dry,
    job,
    actual,
    quarantine: document,
    integrity,
    records: {
      year4: recordsYear4,
      uniqueDefault,
      duplicates: recordsYear4 - uniqueDefault
    }
  };
}

async function photoFlow(inventory, upload) {
  log(`photos: ${photosMode}`);
  let publicSample = null;
  if (upload.sample.length > 0) {
    const sample = upload.sample[0];
    const response = await fetch(`${baseUrl}/uploads/students/${sample.file}`);
    publicSample = {
      file: sample.file,
      status: response.status,
      contentType: response.headers.get("content-type")
    };
    if (response.status !== 200) throw new Error("Public photo route did not return 200");
  }
  return {
    referenced: inventory.referenced,
    images: inventory.images,
    pdfs: inventory.pdfs,
    other: inventory.other,
    missing: inventory.missing,
    uploadable: inventory.uploadable.length,
    bytes: inventory.bytes,
    upload,
    publicSample
  };
}

async function timelineFlow(result) {
  log("timelines");
  ensureBucket(persist);
  const rows = [];
  for (const timeline of result.timelines.exports) {
    const file = path.join(persist, "timelines", `session-${timeline.academicId}.ndjson`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, timeline.ndjson);
    putObject(persist, timeline.key, file, "application/x-ndjson");
    rows.push({
      academicId: timeline.academicId,
      rows: timeline.rows,
      key: timeline.key,
      bytes: Buffer.byteLength(timeline.ndjson),
      sha256: sha256(timeline.ndjson)
    });
  }
  return rows;
}

function reconcile(result) {
  const tables = {};
  let mismatches = 0;
  for (const table of LEGACY_TABLES) {
    const expected = result.tables.get(table)?.rows.length ?? 0;
    const actual = countTable(persist, table);
    tables[table] = { expected, actual };
    if (expected !== actual) mismatches += 1;
  }
  const resolutions = {
    expected: result.resolutions.length,
    actual: Number(
      queryJson(persist, "SELECT COUNT(*) AS count FROM migration_resolutions;")[0]?.count ?? 0
    )
  };
  if (resolutions.expected !== resolutions.actual) mismatches += 1;
  return { tables, mismatches, resolutions };
}

async function main() {
  if (has("--fresh") || !has("--keep")) rmSync(persist, { recursive: true, force: true });
  mkdirSync(persist, { recursive: true });
  const out = path.join(persist, "sql");
  const evidence = {
    runId,
    source,
    sourceSha256: sha256(readFileSync(source)),
    startedAt: Math.floor(Date.now() / 1000),
    status: "running"
  };

  try {
    log("apply migrations");
    applyMigrations(persist);
    log("transform");
    const dump = await readDump(source, LEGACY_TABLES);
    const targetModel = readTargetModel(
      path.resolve(APP_ROOT, "src/lib/server/db/migrations")
    );
    const result = transformDump(dump, {
      digest,
      now: Math.floor(Date.now() / 1000),
      schoolId: 1,
      currentAcademicId: SOURCE_ACADEMIC_ID,
      targetAcademicId: TARGET_ACADEMIC_ID,
      parentArchiveKey: `migration/parents/removed-${runId}.ndjson`,
      sha256: (value) => sha256(value).slice(0, 12),
      targetColumns: targetModel.columns,
      foreignKeys: targetModel.foreignKeys,
      notNull: targetModel.notNull
    });
    const { files } = writeTierFiles(result, out);
    log(`load ${files.length} files`);
    loadTierFiles(persist, files);
    const fk = foreignKeyCheck(persist);
    if (fk.length > 0) throw new Error(`${fk.length} foreign-key violation(s)`);
    evidence.load = {
      sourceSha256: evidence.sourceSha256,
      files: files.length,
      tables: result.tables.size,
      rows: [...result.tables.values()].reduce((sum, table) => sum + table.rows.length, 0),
      findings: result.findings,
      stats: result.stats,
      sourceRows: result.sourceRows,
      outputRows: result.outputRows
    };
    evidence.reconciliation = reconcile(result);
    if (evidence.reconciliation.mismatches > 0) {
      throw new Error(`${evidence.reconciliation.mismatches} reconciliation mismatch(es)`);
    }

    const inventory = inventoryPhotos(result.photos);
    log("materialise local R2");
    worker = startWorker();
    await waitForHealth();
    await stopWorker();
    const upload = uploadPhotos(persist, inventory, photosMode);
    const timelines = await timelineFlow(result);

    log("start worker");
    session = mintAdminSession(persist, true);
    worker = startWorker();
    await waitForHealth();
    baseUrl = `http://127.0.0.1:${port}`;

    evidence.integritySource = await api(
      `/api/v1/admin/sessions/${SOURCE_ACADEMIC_ID}/integrity`,
      { academicId: SOURCE_ACADEMIC_ID }
    );

    evidence.bootstrap = await bootstrapFlow();
    evidence.staffing = await staffingFlow();
    evidence.activation = await activateFlow();

    if (!skipArchive) {
      evidence.archive = await archiveFlow(
        sessionsArg.split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
      );
    } else {
      evidence.archive = { skipped: true };
    }

    evidence.promotion = await promotionFlow();
    evidence.integrityTarget = await api(
      `/api/v1/admin/sessions/${TARGET_ACADEMIC_ID}/integrity`,
      { academicId: TARGET_ACADEMIC_ID }
    );
    evidence.photos = await photoFlow(inventory, upload);
    evidence.timelines = timelines;
    evidence.status = "completed";
    evidence.finishedAt = Math.floor(Date.now() / 1000);
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error instanceof Error ? error.message : String(error);
    evidence.finishedAt = Math.floor(Date.now() / 1000);
    throw error;
  } finally {
    writeFileSync(path.join(persist, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    await stopWorker();
    log(`evidence: ${path.join(persist, "evidence.json")}`);
  }
}

main().catch((error) => {
  console.error(`[${runId}] rehearsal failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
