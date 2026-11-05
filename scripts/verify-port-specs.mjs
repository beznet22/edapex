#!/usr/bin/env node
/**
 * Verifies the port spec suite.
 *
 * Checks:
 *   1. every relative markdown link resolves to a real file
 *   2. every src link with an #L anchor points at an existing, non-blank line
 *   3. no placeholder markers remain
 *   4. cross-document counts agree (62 legacy tables, 108 methods, persona numbers)
 *   5. error ownership: repository errors in 01, service errors in 02
 *   6. every in-scope service method is mapped in 02
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "docs/cloudflare-port";
const SRC_ROOT = process.cwd();

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
const failures = [];
let linkCount = 0;
let anchorCount = 0;

const readLines = (p) => fs.readFileSync(p, "utf8").split("\n");

for (const file of files) {
  const full = path.join(DIR, file);
  const text = fs.readFileSync(full, "utf8");

  // Placeholder markers inside code spans or fenced blocks are documentation
  // about the check, not actual placeholders.
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  if (/\b(TBD|TODO)\b/.test(prose)) failures.push(`${file}: contains TBD/TODO`);

  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = m[1];
    if (/^https?:/.test(target) || target.startsWith("#")) continue;
    linkCount += 1;

    const [rawPath, rawAnchor] = target.split("#");
    const resolved = path.resolve(path.dirname(full), rawPath || file);

    if (!fs.existsSync(resolved)) {
      failures.push(`${file}: link target missing — ${target}`);
      continue;
    }

    if (rawAnchor && /^L\d+$/.test(rawAnchor)) {
      anchorCount += 1;
      const lineNo = Number(rawAnchor.slice(1));
      const line = readLines(resolved)[lineNo - 1];
      if (line === undefined) failures.push(`${file}: anchor out of range — ${target}`);
      else if (line.trim().length === 0) failures.push(`${file}: anchor on blank line — ${target}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Cross-document counts
// ---------------------------------------------------------------------------
const repoSpec = fs.readFileSync(path.join(DIR, "01-repository-layer.spec.md"), "utf8");
const mapSpec = fs.readFileSync(path.join(DIR, "01b-repository-migration-map.md"), "utf8");
const authSpec = fs.readFileSync(path.join(DIR, "04-auth-identity.spec.md"), "utf8");
const cutover = fs.readFileSync(path.join(DIR, "04a-auth-cutover.spec.md"), "utf8");
const serviceSpec = fs.readFileSync(path.join(DIR, "02-service-layer.spec.md"), "utf8");
const readme = fs.readFileSync(path.join(DIR, "README.md"), "utf8");
const playbook = fs.readFileSync(path.join(DIR, "01a-d1-optimization.playbook.md"), "utf8");
const roadmap = fs.readFileSync(path.join(DIR, "ROADMAP.md"), "utf8");
const httpSpec = fs.readFileSync(path.join(DIR, "03-http-layer.spec.md"), "utf8");
const endpointMap = fs.readFileSync(path.join(DIR, "03b-endpoint-map.md"), "utf8");
const migrationSpec = fs.readFileSync(path.join(DIR, "05-d1-migration.spec.md"), "utf8");
const archiveSpec = fs.readFileSync(path.join(DIR, "06-archive-and-retrieval.spec.md"), "utf8");

// README must index the design principles and the per-layer size caps.
if (!readme.includes("## Design principles")) failures.push("README: design principles section missing");
for (const cap of ["300 lines", "400 lines"]) {
  if (!readme.includes(cap)) failures.push(`README: missing file-size cap \`${cap}\``);
}
if (!/File-size caps/.test(readme)) failures.push("README: file-size cap table missing");
if (!/authoritative list of legacy SMS tables/i.test(readme)) failures.push("README: catalog authority statement missing");
if (!/62 legacy tables/.test(readme)) failures.push("README: 62-legacy-table port surface not stated");

// The legacy session store is outside the SMS set and must not reappear in any port spec.
const SPEC_TEXTS = {
  README: readme,
  "01": repoSpec,
  "01a": playbook,
  "02": serviceSpec,
  "03": httpSpec,
  "04": authSpec,
  "04a": cutover,
  "05": migrationSpec,
  "06": archiveSpec
};
for (const [name, text] of Object.entries(SPEC_TEXTS)) {
  if (text.includes("ai_sessions")) failures.push(`${name}: legacy session table must not appear in the port specs`);
}
if (!/Renaming policy/.test(serviceSpec)) failures.push("02: renaming policy missing");

// Roadmap must carry the agent contract and every phase brief.
if (!roadmap.includes("Instructions for every coding agent")) failures.push("ROADMAP: agent instructions missing");
for (let i = 0; i <= 9; i += 1) {
  if (!roadmap.includes(`### Phase ${i} —`)) failures.push(`ROADMAP: phase ${i} brief missing`);
}
if (!readme.includes("ROADMAP.md")) failures.push("README: roadmap not referenced");
if (!readme.includes("Repository layout")) failures.push("README: repository layout decision missing");
if (!roadmap.includes("Part 5 — Repository layout")) failures.push("ROADMAP: repository layout contract missing");

// Progress tracker and the port workspace must exist and stay wired together.
const progress = fs.readFileSync(path.join(DIR, "PROGRESS.md"), "utf8");
for (const section of ["## Phase status", "## Gate checklists", "## Change log"]) {
  if (!progress.includes(section)) failures.push(`PROGRESS: missing \`${section}\``);
}
for (let i = 0; i <= 9; i += 1) {
  if (!progress.includes(`| ${i} |`)) failures.push(`PROGRESS: phase ${i} row missing`);
}
if (!roadmap.includes("PROGRESS.md")) failures.push("ROADMAP: progress tracker not referenced");
if (!readme.includes("PROGRESS.md")) failures.push("README: progress tracker not referenced");

const workspaceAgents = path.resolve(DIR, "..", "..", "apps", "api", "AGENTS.md");
if (!fs.existsSync(workspaceAgents)) {
  failures.push("apps/api/AGENTS.md: port workspace instructions missing");
} else {
  const text = fs.readFileSync(workspaceAgents, "utf8");
  if (!text.includes("All port code goes here")) failures.push("apps/api/AGENTS.md: workspace scope statement missing");
  if (!text.includes("PROGRESS.md")) failures.push("apps/api/AGENTS.md: does not require progress updates");
  if (!text.includes("## Repository layout")) failures.push("apps/api/AGENTS.md: repository layout section missing");
  if (!text.includes("EdApex API service")) failures.push("apps/api/AGENTS.md: service identity missing");
  if (!text.includes("workspace package")) failures.push("apps/api/AGENTS.md: workspace placement missing");
  if (!/no extraction/i.test(text)) failures.push("apps/api/AGENTS.md: no-extraction decision missing");
}

const layoutText = [
  readme,
  roadmap,
  fs.existsSync(workspaceAgents) ? fs.readFileSync(workspaceAgents, "utf8") : ""
].join("\n");
for (const forbidden of ["Future extraction", "Repo extraction", "standalone deployment repository", "permalink"]) {
  if (layoutText.toLowerCase().includes(forbidden.toLowerCase())) {
    failures.push(`repository layout: obsolete extraction wording — ${forbidden}`);
  }
}

const workspaceReadme = path.resolve(DIR, "..", "..", "apps", "api", "README.md");
if (!fs.existsSync(workspaceReadme)) {
  failures.push("apps/api/README.md: workspace readme missing");
} else {
  const text = fs.readFileSync(workspaceReadme, "utf8");
  for (const section of ["## Quickstart", "## Layout", "## Before opening a PR"]) {
    if (!text.includes(section)) failures.push(`apps/api/README.md: missing \`${section}\``);
  }
  if (!text.includes("PROGRESS.md")) failures.push("apps/api/README.md: does not reference the progress tracker");
}

const expect = [
  [/^\| \*\*Total\*\* \| \*\*62\*\* \|/m, "01: aggregate table total is not 62", repoSpec],
  [/^\| \*\*Total\*\* \| \*\*108\*\* \|/m, "01b: method total is not 108", mapSpec],
  [/713/, "04: user email count missing", authSpec],
  [/688/, "04: distinct email count missing", authSpec],
  [/900/, "04: student count missing", authSpec],
  [/489/, "04: linked parent count missing", authSpec],
  [/1,610/, "04a: user total missing", cutover]
];

for (const [re, message, haystack] of expect) {
  if (!re.test(haystack)) failures.push(message);
}

// HTTP layer invariants
if (!/export type AppType = typeof app/.test(httpSpec)) failures.push("03: AppType export missing");
if (!httpSpec.includes("TENANT_SCOPE_REQUIRED")) failures.push("03: 422 tenant contract missing");
if (!httpSpec.includes("**55**")) failures.push("03: handler count does not match the measured 55");
if (/"error":\s*\{/.test(repoSpec)) failures.push("01: nested error envelope contradicts the flat contract in 03");
if (!endpointMap.includes("## Full inventory")) failures.push("03b: generated inventory table missing");

// Migration spec invariants
for (const needle of ["bootstrap", "UPPER BASIC 1", "681 current records", "222", "defer_foreign_keys", "integrity", "sm_exams", "promotion_batches", "copy_with_academic_year", "/promote", "/terms", "quarantine.pdf", "sequence"]) {
  if (!migrationSpec.toLowerCase().includes(needle.toLowerCase()))
    failures.push(`05: missing \`${needle}\``);
}
if (!migrationSpec.includes("TERM_SEQUENCE_GAP")) failures.push("05: sequential-term rule missing");
if (/assessment_components/.test(migrationSpec)) failures.push("05: assessment_components should be out of scope");
if (!migrationSpec.includes("AMBIGUOUS_EMAIL")) failures.push("05: duplicate-email policy missing");

// Archive spec invariants
for (const needle of ["/marksheets", "/transcripts", "schemaVersion", "WIPE_ALL_ARCHIVES", "secondAdminToken", "archived_readable", "/publish", "/versions", "/retention/sweep", "/jobs"]) {
  if (!archiveSpec.includes(needle)) failures.push(`06: missing \`${needle}\``);
}
if (!/two distinct admins|Two admins|two admins/i.test(archiveSpec)) failures.push("06: dual-control deletion rule missing");

// The aggregate table must sum to 62
const counts = [...repoSpec.matchAll(/^\| `([a-z/-]+)\/` \| (\d+) \|/gm)].map((m) => Number(m[2]));
const sum = counts.reduce((a, b) => a + b, 0);
if (counts.length > 0 && sum !== 62) failures.push(`01: aggregate counts sum to ${sum}, expected 62`);

// ---------------------------------------------------------------------------
// Error ownership
// ---------------------------------------------------------------------------
const rowPattern = (name) => new RegExp("^\\| `" + name + "`", "m");

for (const err of ["AuthError", "PermissionError", "ValidationError", "WorkspaceMismatchError"]) {
  if (rowPattern(err).test(repoSpec)) failures.push(`01: error row ${err} still owned by the repository layer`);
  if (!rowPattern(err).test(serviceSpec)) failures.push(`02: error ${err} is not documented`);
}
for (const err of ["DbEntityNotFoundError", "DbInternalError", "DbError"]) {
  if (!rowPattern(err).test(repoSpec)) failures.push(`01: repository error ${err} is not documented`);
}

// ---------------------------------------------------------------------------
// Service method coverage
// ---------------------------------------------------------------------------
const SERVICE_FILES = [
  "assessment.service.ts",
  "auth.service.ts",
  "assessment-publisher.service.ts",
  "settings.service.ts",
  "assessment-ocr.service.ts"
];

const methodDeclarations = [];
for (const file of SERVICE_FILES) {
  const src = fs.readFileSync(path.join(SRC_ROOT, "src/lib/server/service", file), "utf8");
  for (const m of src.matchAll(/^\s+async\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
    methodDeclarations.push({ file, name: m[1] });
  }
}

const methodNames = new Set(methodDeclarations.map((d) => d.name));
const missingMethods = [...methodNames].filter((name) => !serviceSpec.includes("`" + name + "`"));
if (missingMethods.length > 0) failures.push(`02: methods not mapped — ${missingMethods.join(", ")}`);

console.log(`documents: ${files.length}`);
console.log(`relative links checked: ${linkCount}`);
console.log(`src anchors checked: ${anchorCount}`);
console.log(`aggregate sum: ${sum}`);
console.log(`service methods discovered: ${methodDeclarations.length} declarations, ${methodNames.size} unique`);
console.log(`failures: ${failures.length}`);

if (failures.length > 0) {
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("spec suite verified");
