#!/usr/bin/env node
/**
 * Export the rehearsal-generated historical archives for the one-window load.
 *
 * Reads the local rehearsal D1/R2 (never remote), writes archive JSON objects,
 * metadata SQL and an R2 upload script under .tmp. The script does not call
 * `--remote`; the generated upload script is executed only in the cutover.
 *
 * Usage (from apps/api/):
 *   node scripts/cutover/archive-export.mjs \
 *     --persist .tmp/rehearsal-final \
 *     --out .tmp/cutover-plan/archive
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import { queryJson } from "../migration/load.mjs";
import { insertStatements } from "../migration/sql-literal.mjs";
import {
  PreflightError,
  assertOutputUnderTmp,
  shellQuote
} from "./preflight-plan.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const persist = path.resolve(valueOf("--persist", ".tmp/rehearsal-final"));
const out = assertOutputUnderTmp(
  APP_ROOT,
  path.resolve(valueOf("--out", ".tmp/cutover-plan/archive"))
);
const bucket = valueOf("--bucket", "edapex-media");

const ARCHIVE_COLUMNS = [
  "id",
  "school_id",
  "academic_id",
  "student_id",
  "student_record_id",
  "exam_type_id",
  "object_key",
  "checksum",
  "bytes",
  "schema_version",
  "version",
  "status",
  "published_at",
  "published_by",
  "reason",
  "error",
  "created_at"
];
const SUMMARY_COLUMNS = [
  "id",
  "school_id",
  "academic_id",
  "student_id",
  "term_id",
  "sequence",
  "total",
  "average",
  "grade",
  "gpa",
  "position",
  "subject_count",
  "created_at"
];

if (!existsSync(persist)) {
  throw new PreflightError(`Rehearsal persist directory not found: ${persist}`);
}
if (!existsSync(out)) mkdirSync(out, { recursive: true });
else {
  rmSync(path.join(out, "objects"), { recursive: true, force: true });
  rmSync(path.join(out, "archive-metadata.sql"), { force: true });
  rmSync(path.join(out, "archive-upload.sh"), { force: true });
  rmSync(path.join(out, "archive-export.json"), { force: true });
}
const objectsDir = path.join(out, "objects");
mkdirSync(objectsDir, { recursive: true });

const archiveRows = queryJson(
  persist,
  `SELECT ${ARCHIVE_COLUMNS.join(", ")} FROM archive_objects ORDER BY id;`
);
const summaryRows = queryJson(
  persist,
  `SELECT ${SUMMARY_COLUMNS.join(", ")} FROM session_result_summary ORDER BY id;`
);
if (archiveRows.length === 0) {
  throw new PreflightError("No archive_objects in the rehearsal D1; run the final rehearsal first");
}

function runWrangler(argsToRun) {
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", ...argsToRun, "--local", "--persist-to", persist],
    {
      cwd: APP_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }
    }
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new PreflightError(
      `wrangler ${argsToRun.join(" ")} failed: ${(result.stderr ?? "").trim()}`
    );
  }
}

const exportRows = [];
for (const row of archiveRows) {
  const key = String(row.object_key);
  const localFile = path.join(objectsDir, key);
  mkdirSync(path.dirname(localFile), { recursive: true });
  runWrangler([
    "r2",
    "object",
    "get",
    `${bucket}/${key}`,
    "--file",
    localFile
  ]);
  if (!existsSync(localFile)) {
    throw new PreflightError(`Archive object was not written: ${key}`);
  }
  const bytes = readFileSync(localFile);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== String(row.checksum)) {
    throw new PreflightError(`Archive checksum mismatch for ${key}`);
  }
  if (bytes.length !== Number(row.bytes)) {
    throw new PreflightError(`Archive byte count mismatch for ${key}`);
  }
  exportRows.push({
    objectKey: key,
    checksum: digest,
    bytes: bytes.length,
    file: path.relative(APP_ROOT, localFile)
  });
}

const metadataStatements = [
  "PRAGMA defer_foreign_keys = on;",
  ...insertStatements("archive_objects", ARCHIVE_COLUMNS, archiveRows, 20),
  ...insertStatements("session_result_summary", SUMMARY_COLUMNS, summaryRows, 20)
];
writeFileSync(
  path.join(out, "archive-metadata.sql"),
  `${metadataStatements.join("\n\n")}\n`
);

const uploadLines = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  `cd ${shellQuote(APP_ROOT)}`,
  "# Wrangler v4 defaults R2 commands to local mode; --remote is mandatory.",
  `echo 'Uploading ${exportRows.length} archive object(s) to remote R2.'`,
  ""
];
for (const row of exportRows) {
  uploadLines.push(
    `pnpm exec wrangler r2 object put ${shellQuote(
      `${bucket}/${row.objectKey}`
    )} --remote --file ${shellQuote(row.file)} --content-type application/json`
  );
}
uploadLines.push("", "echo 'Archive upload complete.'", "");
writeFileSync(path.join(out, "archive-upload.sh"), uploadLines.join("\n"), {
  mode: 0o755
});

const summary = {
  sourcePersist: persist,
  bucket,
  objects: exportRows.length,
  summaries: summaryRows.length,
  objectBytes: exportRows.reduce((sum, row) => sum + row.bytes, 0),
  objectsBySession: archiveRows.reduce((counts, row) => {
    const key = String(row.academic_id);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {}),
  files: {
    metadataSql: path.join(out, "archive-metadata.sql"),
    uploadScript: path.join(out, "archive-upload.sh")
  }
};
writeFileSync(
  path.join(out, "archive-export.json"),
  `${JSON.stringify(summary, null, 2)}\n`
);
writeFileSync(
  path.join(out, "archive-objects.ndjson"),
  `${exportRows.map((row) => JSON.stringify(row)).join("\n")}\n`
);

console.log(`archive objects: ${summary.objects}`);
console.log(`archive summaries: ${summary.summaries}`);
console.log(`objects by session: ${JSON.stringify(summary.objectsBySession)}`);
console.log(`metadata: ${summary.files.metadataSql}`);
console.log(`upload: ${summary.files.uploadScript}`);
console.log("No remote command was executed.");
