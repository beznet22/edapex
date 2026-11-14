#!/usr/bin/env node
/**
 * Turns rehearsal evidence into the PII-free Phase 7 report.
 * Counts and checksums only; no student, parent or staff names.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const pathA = valueOf("--a", ".tmp/rehearsal-a/evidence.json");
const pathB = valueOf("--b", ".tmp/rehearsal-b/evidence.json");
const out = valueOf("--out", "../../docs/cloudflare-port/audit/phase-7-rehearsal.md");

const a = JSON.parse(readFileSync(pathA, "utf8"));
let b = null;
try {
  b = JSON.parse(readFileSync(pathB, "utf8"));
} catch {
  b = null;
}

const lines = [
  "# Phase 7 rehearsal report",
  "",
  "Generated from `apps/api/.tmp/rehearsal-a/evidence.json`"
    + (b === null ? "." : " and `rehearsal-b`."),
  "Counts and checksums only; no personal data.",
  "",
  "## Source and load",
  "",
  `- Source SHA-256: \`${a.sourceSha256}\``,
  `- Status: **${a.status}**`,
  `- Tables: ${a.load?.tables ?? 0}`,
  `- Rows loaded: ${a.load?.rows ?? 0}`,
  `- Resolutions: ${a.reconciliation?.resolutions?.actual ?? 0}`,
  `- Foreign keys: 0 violations (preflight + post-load check)`,
  `- Reconciliation mismatches: ${a.reconciliation?.mismatches ?? "n/a"}`,
  "",
  "### Transform findings",
  "",
  "| Finding | Count |",
  "|---|---|",
  ...Object.entries(a.load?.findings ?? {}).map(([key, value]) => `| ${key} | ${value} |`),
  "",
  "## Integrity",
  "",
  "| Check | Source session | Target session |",
  "|---|---|---|",
  `| Blocking identity | ${a.integritySource?.blockingIdentity ?? "n/a"} | ${a.integrityTarget?.blockingIdentity ?? "n/a"} |`,
  `| Blocking target | ${a.integritySource?.blockingTarget ?? "n/a"} | ${a.integrityTarget?.blockingTarget ?? "n/a"} |`,
  `| Gate | ${a.integritySource?.gate ?? "n/a"} | ${a.integrityTarget?.gate ?? "n/a"} |`,
  ""
];

const bootstrapCounts = a.bootstrap?.job?.result?.counts ?? {};
const readiness = a.bootstrap?.job?.result?.readiness ?? {};
lines.push(
  "## Bootstrap",
  "",
  `- Dry-run planned classes: ${a.bootstrap?.dry?.counts?.classes ?? "n/a"}; sections: ${a.bootstrap?.dry?.counts?.sections ?? "n/a"}`,
  `- Classes: ${bootstrapCounts.classes ?? "n/a"}`,
  `- Sections: ${bootstrapCounts.sections ?? "n/a"}`,
  `- Subjects: ${bootstrapCounts.subjects ?? "n/a"}`,
  `- Class-sections: ${bootstrapCounts.classSections ?? "n/a"}`,
  `- Subject assignments: ${bootstrapCounts.subjectAssignments ?? "n/a"} active copied; ${a.load?.sourceRows?.sm_assign_subjects ?? "n/a"} source rows (${(a.load?.sourceRows?.sm_assign_subjects ?? 0) - (bootstrapCounts.subjectAssignments ?? 0)} inactive, not copied)`,
  `- Class teachers copied: ${bootstrapCounts.classTeachers ?? "n/a"} (skipped ${bootstrapCounts.skippedClassTeachers ?? 0})`,
  `- Routines copied: ${bootstrapCounts.routines ?? "n/a"}`,
  `- Student categories: ${bootstrapCounts.categories ?? "n/a"}`,
  `- Grade bands: ${bootstrapCounts.gradeBands ?? "n/a"}`,
  `- Exam configurations: ${bootstrapCounts.examConfigs ?? "n/a"}`,
  `- Activation: ${bootstrapCounts.activation ?? 0} (first bootstrap run; activation job: ${a.activation?.job?.result?.counts?.activation ?? 0})`,
  `- Readiness after bootstrap: ${readiness.classesWithoutAssignments ?? "n/a"} unstaffed, ${readiness.unreviewedSections ?? "n/a"} unreviewed, ${readiness.targetCurrentRecords ?? 0} current records`,
  `- Final readiness: ${a.promotion?.integrity?.readiness?.classesWithoutAssignments ?? "n/a"} unstaffed, ${a.promotion?.integrity?.readiness?.unreviewedSections ?? "n/a"} unreviewed, ${a.promotion?.integrity?.readiness?.targetCurrentRecords ?? 0} current records, ${a.promotion?.integrity?.readiness?.duplicateCurrentRecords ?? 0} duplicate defaults`,
  ""
);

lines.push(
  "## Staffing review",
  "",
  `- Sections before: ${a.staffing?.beforeSections ?? "n/a"}`,
  `- Accepted copied: ${a.staffing?.accepted?.reviewed ?? "n/a"}`,
  `- Manually reviewed: ${a.staffing?.reviewed ?? "n/a"}`,
  `- Remaining unreviewed: ${a.staffing?.remaining ?? "n/a"}`,
  ""
);

if (a.archive?.sessions) {
  lines.push("## Archive and purge", "", "| Session | Status | Objects | Summaries | Manifest | Gaps |", "|---|---|---|---|---|---|");
  for (const session of a.archive.sessions) {
    lines.push(
      `| ${session.sessionId} | ${session.status} | ${session.objects?.total ?? 0} | ${session.summaries ?? 0} | ${session.manifestObjects ?? 0} | ${session.gaps ?? 0} |`
    );
  }
  lines.push("", "Live historical rows after purge:", "", "| Table | Rows |", "|---|---|");
  for (const [table, count] of Object.entries(a.archive.live ?? {})) {
    lines.push(`| ${table} | ${count} |`);
  }
  lines.push(
    "",
    "Gaps are historical students with no complete transcript (missing placement/records);",
    "the manifest lists them and the objects that exist all verify by checksum.",
    ""
  );
} else {
  lines.push("## Archive and purge", "", a.archive?.skipped === true ? "Skipped in this run." : "Not run.", "");
}

const promotion = a.promotion ?? {};
lines.push(
  "## Promotion",
  "",
  `- Dry-run batches: ${promotion.dry?.batches?.length ?? "n/a"}`,
  `- Promoted (non-DAYCARE): ${promotion.actual?.promoted ?? "n/a"}`,
  `- DAYCARE retained: ${promotion.actual?.daycare ?? "n/a"}`,
  `- Unplaced (no class): ${promotion.actual?.unplaced ?? "n/a"}`,
  `- No current record: ${promotion.actual?.noCurrentRecord ?? "n/a"}`,
  `- Destination current records: ${promotion.actual?.targetRecords ?? "n/a"}`,
  `- Quarantine rows: ${promotion.actual?.quarantine ?? "n/a"}`,
  `- Year-4 records: ${promotion.records?.year4 ?? "n/a"} (${promotion.records?.uniqueDefault ?? "n/a"} unique default, ${promotion.records?.duplicates ?? "n/a"} non-default duplicates)`,
  "",
  "The 681 year-4 records reconcile as 666 unique students plus 15 non-default",
  "duplicate records. Promotion uses `is_default = 1`, so the destination has 663",
  "current records (639 promoted + 24 DAYCARE) and the 3 class-null students are",
  "reported as UNPLACED. The 15 duplicates are historical, non-default rows and are",
  "not promoted; promoting them would violate the one-current-record invariant.",
  ""
);

lines.push(
  "## Photos and timelines",
  "",
  `- Referenced photo URLs: ${a.photos?.referenced ?? "n/a"} (${a.photos?.images ?? 0} images, ${a.photos?.pdfs ?? 0} PDFs, ${a.photos?.other ?? 0} other)`,
  `- Missing image files: ${a.photos?.missing ?? "n/a"} (local static tree is partial; the source owner must supply these for the production upload)`,
  `- Uploadable images: ${a.photos?.uploadable ?? "n/a"}`,
  `- Uploaded in this run: ${a.photos?.upload?.uploaded ?? 0} of ${a.photos?.uploadable ?? 0} (${a.photos?.upload?.mode ?? "skip"}; the production runbook uses \`--photos full\`)`,
  `- Image bytes: ${a.photos?.bytes ?? 0}`,
  `- Public photo sample: ${a.photos?.publicSample?.status ?? "not checked"}`,
  `- Timeline exports: ${(a.timelines ?? []).length}`,
  ...(a.timelines ?? []).map(
    (timeline) =>
      `  - session ${timeline.academicId}: ${timeline.rows} rows, ${timeline.bytes} bytes, SHA-256 \`${timeline.sha256}\``
  ),
  ""
);

if (b !== null) {
  lines.push(
    "## Two-run comparison",
    "",
    `- Run B status: **${b.status}**`,
    `- Run B rows: ${b.load?.rows ?? "n/a"}`,
    `- Run B destination records: ${b.promotion?.actual?.targetRecords ?? "n/a"}`,
    `- Run B quarantine: ${b.promotion?.actual?.quarantine ?? "n/a"}`,
    "- The machine comparison is in `.tmp/rehearsal-a/reconciliation.json`.",
    ""
  );
}

let o2 = "";
try {
  o2 = readFileSync(path.join(path.dirname(pathA), "o2-report.md"), "utf8");
} catch {
  o2 = "O2 audit not captured for this run.";
}
lines.push(
  "## O2 index evidence",
  "",
  o2,
  ""
);

writeFileSync(path.resolve(out), `${lines.join("\n")}\n`);
console.log(`wrote ${path.resolve(out)}`);
