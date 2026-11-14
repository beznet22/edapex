#!/usr/bin/env node
/**
 * Offline transform CLI for the remote dump.
 *
 * Usage:
 *   node scripts/migration/transform-cli.mjs \
 *     --source ../../edapexdb.sql \
 *     --out .tmp/migration/transform \
 *     --digest <64-hex sha256> \
 *     [--date 2026-11-06] [--now <unix-seconds>]
 *
 * Output is PII-bearing and lives under apps/api/.tmp/ (gitignored). The
 * committed evidence is the counts/checksums printed by the rehearsal.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readDump } from "./dump-reader.mjs";
import { LEGACY_TABLES, TABLE_TIER } from "./tables.mjs";
import { readTargetModel } from "./target-schema.mjs";
import { transformDump } from "./transform/index.mjs";

const args = process.argv.slice(2);
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const source = valueOf("--source", "edapexdb.sql");
const out = valueOf("--out", ".tmp/migration/transform");
const digest = valueOf("--digest");
const date = valueOf("--date", new Date().toISOString().slice(0, 10));
const now = Number(valueOf("--now", String(Math.floor(Date.now() / 1000))));

if (digest === undefined || !/^[0-9a-f]{64}$/i.test(digest)) {
  console.error(
    "usage: node scripts/migration/transform-cli.mjs --source <dump> --out <dir> --digest <64-hex sha256>"
  );
  process.exit(1);
}

const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
const emailHash = (value) => sha256(value).slice(0, 12);

function canonicalRow(row, columns) {
  const ordered = {};
  for (const column of [...columns].sort()) ordered[column] = row[column] ?? null;
  return JSON.stringify(ordered);
}

function tableDigest(rows, columns) {
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(canonicalRow(row, columns));
    hash.update("\n");
  }
  return hash.digest("hex");
}

mkdirSync(out, { recursive: true });
mkdirSync(path.join(out, "tables"), { recursive: true });
mkdirSync(path.join(out, "timelines"), { recursive: true });

const dump = await readDump(source, LEGACY_TABLES);
const targetModel = readTargetModel(
  path.resolve(import.meta.dirname, "../../src/lib/server/db/migrations")
);
const result = transformDump(dump, {
  digest: digest.toLowerCase(),
  now,
  schoolId: 1,
  currentAcademicId: 4,
  targetAcademicId: 5,
  parentArchiveKey: `migration/parents/removed-${date}.ndjson`,
  sha256: emailHash,
  targetColumns: targetModel.columns,
  foreignKeys: targetModel.foreignKeys,
  notNull: targetModel.notNull
});

const manifestTables = {};
for (const name of LEGACY_TABLES) {
  const table = result.tables.get(name);
  if (table === undefined) continue;
  manifestTables[name] = {
    tier: TABLE_TIER[name] ?? null,
    sourceRows: result.sourceRows[name] ?? 0,
    outputRows: table.rows.length,
    columns: table.columns,
    sha256: tableDigest(table.rows, table.columns)
  };
  if (table.rows.length > 0) {
    const lines = table.rows.map((row) => canonicalRow(row, table.columns)).join("\n");
    writeFileSync(path.join(out, "tables", `${name}.ndjson`), `${lines}\n`);
  }
}

writeFileSync(
  path.join(out, "resolutions.ndjson"),
  result.resolutions.map((row) => JSON.stringify(row)).join("\n") +
    (result.resolutions.length === 0 ? "" : "\n")
);
writeFileSync(
  path.join(out, "parents-removed.ndjson"),
  result.removedParents
    .map((entry) => JSON.stringify({ reason: entry.reason, parent: entry.row }))
    .join("\n") + (result.removedParents.length === 0 ? "" : "\n")
);
writeFileSync(
  path.join(out, "deactivated-users.csv"),
  ["user_id,email_hash"]
    .concat(result.deactivatedUsers.map((row) => `${row.id},${row.emailHash ?? ""}`))
    .join("\n") + "\n"
);
for (const timeline of result.timelines.exports) {
  writeFileSync(path.join(out, "timelines", `session-${timeline.academicId}.ndjson`), timeline.ndjson);
}
writeFileSync(
  path.join(out, "photos.json"),
  `${JSON.stringify(
    result.photos.map((photo) => ({
      url: photo.url,
      file: photo.file,
      extension: photo.extension,
      kind: photo.kind,
      references: photo.references,
      students: photo.studentIds.length
    })),
    null,
    2
  )}\n`
);

const manifest = {
  source,
  sourceSha256: createHash("sha256")
    .update(readFileSync(source))
    .digest("hex"),
  digest: digest.toLowerCase(),
  generatedAt: now,
  tables: manifestTables,
  findings: result.findings,
  resolutions: result.resolutions.length,
  stats: result.stats,
  totals: {
    sourceRows: Object.values(result.sourceRows).reduce((sum, value) => sum + value, 0),
    outputRows: Object.values(result.outputRows).reduce((sum, value) => sum + value, 0)
  }
};
writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`source: ${source}`);
console.log(`source sha256: ${manifest.sourceSha256}`);
console.log(`tables: ${Object.keys(manifestTables).length}`);
console.log(`source rows: ${manifest.totals.sourceRows}`);
console.log(`output rows: ${manifest.totals.outputRows}`);
console.log(`resolutions: ${result.resolutions.length}`);
console.log(
  `findings: ${Object.entries(result.findings)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")}`
);
console.log(`photos: ${result.photos.length} referenced`);
console.log(`wrote ${out}`);
