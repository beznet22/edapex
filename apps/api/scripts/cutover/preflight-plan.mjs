/**
 * Pure plan/gate/command generation for the Phase 8 preflight.
 *
 * The CLI (`preflight.mjs`) runs the existing transform and local-load scripts,
 * then hands their evidence here. Nothing in this module spawns a process or
 * touches a remote resource; the generated shell scripts are the only place a
 * `--remote` command appears.
 */
import path from "node:path";

export class PreflightError extends Error {
  constructor(message) {
    super(message);
    this.name = "PreflightError";
  }
}

function assertInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new PreflightError(`${label} must be a non-negative integer`);
  }
}

function requireGate(gates, label) {
  const failed = Object.entries(gates)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  if (failed.length > 0) {
    throw new PreflightError(`Preflight gates failed: ${failed.join(", ")}`);
  }
  return label;
}

/**
 * Require the output directory to stay inside the gitignored `.tmp` tree.
 * @param {string} appRoot
 * @param {string} out
 * @returns {string}
 */
export function assertOutputUnderTmp(appRoot, out) {
  const resolved = path.resolve(out);
  const tmpRoot = path.resolve(appRoot, ".tmp");
  if (!resolved.startsWith(`${tmpRoot}${path.sep}`)) {
    throw new PreflightError(`Output must be a child of ${tmpRoot}; got ${resolved}`);
  }
  return resolved;
}

/**
 * @param {import("./preflight-plan.d.mts").LoadEvidence} evidence
 * @returns {Record<string, boolean>}
 */
export function validateLoadEvidence(evidence) {
  assertInteger(evidence.tableCount, "tableCount");
  assertInteger(evidence.rows, "rows");
  assertInteger(evidence.mismatches, "mismatches");
  assertInteger(evidence.foreignKeyViolations, "foreignKeyViolations");
  assertInteger(evidence.sequences, "sequences");
  assertInteger(evidence.currentRecordIds.expected, "currentRecordIds.expected");
  assertInteger(evidence.currentRecordIds.actual, "currentRecordIds.actual");
  assertInteger(evidence.currentRecordIds.orphans, "currentRecordIds.orphans");
  assertInteger(evidence.resolutions.expected, "resolutions.expected");
  assertInteger(evidence.resolutions.actual, "resolutions.actual");
  return {
    tables: evidence.tableCount === 62,
    mismatches: evidence.mismatches === 0,
    foreignKeys: evidence.foreignKeyViolations === 0,
    sequences: evidence.sequences === 0,
    currentRecords:
      evidence.currentRecordIds.orphans === 0 &&
      evidence.currentRecordIds.expected === evidence.currentRecordIds.actual,
    resolutions: evidence.resolutions.expected === evidence.resolutions.actual
  };
}

/**
 * @param {import("./preflight-plan.d.mts").BuildCutoverPlanInput} input
 * @returns {import("./preflight-plan.d.mts").CutoverPlan}
 */
export function buildCutoverPlan(input) {
  const { loadEvidence, manifest } = input;
  const gates = {
    ...validateLoadEvidence(loadEvidence),
    rows: loadEvidence.rows === manifest.totals.outputRows,
    sourceHash: manifest.sourceSha256 === input.sourceSha256,
    sqlFiles: input.sqlFiles.length > 0
  };
  requireGate(gates, "preflight");

  const tableCounts = {};
  for (const [name, value] of Object.entries(loadEvidence.reconciliation)) {
    tableCounts[name] = {
      expected: value.expected,
      actual: value.actual,
      tier: manifest.tables[name]?.tier ?? null
    };
  }

  const missingFiles = input.photos.rows
    .filter((row) => row.status === "MISSING_FILE")
    .map((row) => ({ file: row.file, url: row.url }));

  return {
    schemaVersion: 1,
    mode: "fresh-target",
    executed: false,
    status: "ready",
    generatedAt: input.generatedAt,
    source: input.source,
    sourceSha256: input.sourceSha256,
    tables: loadEvidence.tableCount,
    rows: loadEvidence.rows,
    resolutions: loadEvidence.resolutions.actual,
    findings: manifest.findings,
    tableCounts,
    sqlFiles: [...input.sqlFiles],
    photos: {
      referenced: input.photos.referenced,
      images: input.photos.images,
      missing: input.photos.missing,
      uploadable: input.photos.rows.filter(
        (row) => row.status === "READY" && row.path !== null
      ).length,
      bytes: input.photos.bytes,
      missingFiles
    },
    gates,
    commands: {
      migrations: "pnpm exec wrangler d1 migrations apply DB --remote",
      load: "bash <PLAN_DIR>/d1-load.sh",
      verify: "bash <PLAN_DIR>/d1-verify.sh",
      photos: "bash <PLAN_DIR>/photo-upload.sh"
    }
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

/**
 * @param {readonly import("./preflight-plan.d.mts").SqlFile[]} sqlFiles
 * @param {string} planDir
 * @returns {string}
 */
export function renderD1LoadScript(sqlFiles, appRoot) {
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `cd ${shellQuote(appRoot)}`,
    "",
    "if grep -q '00000000-0000-0000-0000-000000000000' wrangler.jsonc; then",
    "  echo 'STOP: wrangler.jsonc still has the placeholder D1 id.' >&2",
    "  exit 1",
    "fi",
    "",
    "# Run the migrations separately before this script:",
    "#   pnpm exec wrangler d1 migrations apply DB --remote",
    `echo 'Loading ${sqlFiles.length} tier file(s) into REMOTE D1.'`,
    ""
  ];
  for (const file of sqlFiles) {
    lines.push(`echo ${shellQuote(`==> ${file.name}`)}`);
    lines.push(
      `pnpm exec wrangler d1 execute DB --remote --file ${shellQuote(file.relativePath)}`
    );
  }
  lines.push("", "echo 'D1 load complete.'", "");
  return lines.join("\n");
}

/**
 * @param {string} appRoot
 * @returns {string}
 */
export function renderD1VerifyScript(appRoot) {
  return `#!/usr/bin/env node
/**
 * Generated remote count/FK verifier. Reads cutover-plan.json next to this
 * script and compares every table count with the preflight expectation.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const APP_ROOT = ${JSON.stringify(appRoot)};
const plan = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "cutover-plan.json"), "utf8")
);

function run(args) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: APP_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "").trim());
  }
  return result.stdout ?? "";
}

function parseJson(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("No JSON in wrangler output");
  const parsed = JSON.parse(text.slice(start, end + 1));
  return parsed.flatMap((entry) =>
    Array.isArray(entry?.results) ? entry.results : []
  );
}

function count(table) {
  const rows = parseJson(
    run(["d1", "execute", "DB", "--remote", "--json", "--command",
      \`SELECT COUNT(*) AS count FROM "\${table}";\`])
  );
  return Number(rows[0]?.count ?? -1);
}

const expected = Object.entries(plan.tableCounts).map(([table, value]) => [table, value.expected]);
const mismatches = [];
for (const [table, want] of expected) {
  const got = count(table);
  if (got !== want) mismatches.push({ table, want, got });
  else console.log(\`ok \${table}: \${got}\`);
}

const fk = parseJson(
  run(["d1", "execute", "DB", "--remote", "--json", "--command", "PRAGMA foreign_key_check;"])
);
if (fk.length > 0) {
  console.error(\`\${fk.length} foreign-key violation(s)\`);
  console.error(JSON.stringify(fk.slice(0, 20), null, 2));
}
if (mismatches.length > 0) {
  console.error(JSON.stringify(mismatches, null, 2));
}
if (mismatches.length > 0 || fk.length > 0) process.exit(1);
console.log("remote count and FK checks complete");
`;
}

/**
 * @param {string} planDir
 * @param {string} appRoot
 * @returns {string}
 */
export function renderD1VerifyWrapper(planDir, appRoot) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `cd ${shellQuote(appRoot)}`,
    `node ${shellQuote(path.join(planDir, "d1-verify.mjs"))}`,
    ""
  ].join("\n");
}

/**
 * @param {readonly import("./preflight-plan.d.mts").PhotoRow[]} rows
 * @param {string} appRoot
 * @returns {string}
 */
export function renderPhotoUploadScript(rows, appRoot) {
  const contentTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif"
  };
  const uploadable = rows.filter((row) => row.status === "READY" && row.path !== null);
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `cd ${shellQuote(appRoot)}`,
    "# Wrangler v4 defaults R2 commands to local mode; --remote is mandatory.",
    `echo 'Uploading ${uploadable.length} photo(s) to remote R2.'`,
    ""
  ];
  for (const row of uploadable) {
    const type = contentTypes[row.extension.toLowerCase()] ?? "application/octet-stream";
    lines.push(
      `pnpm exec wrangler r2 object put ${shellQuote(
        `edapex-media/uploads/students/${row.file}`
      )} --remote --file ${shellQuote(row.path ?? "")} --content-type ${shellQuote(type)}`
    );
  }
  lines.push("", "echo 'Photo upload complete.'", "");
  return lines.join("\n");
}

function csvEscape(value) {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

/**
 * @param {readonly import("./preflight-plan.d.mts").PhotoRow[]} rows
 * @returns {string}
 */
export function renderMissingPhotosCsv(rows) {
  const missing = rows.filter((row) => row.status === "MISSING_FILE");
  const lines = ["file,url"];
  for (const row of missing) {
    lines.push(`${csvEscape(row.file)},${csvEscape(row.url)}`);
  }
  return `${lines.join("\n")}\n`;
}
