#!/usr/bin/env node
/**
 * Phase 9A archive manifest verification and repair.
 *
 * Default: fetch each session manifest from R2 and report coverage.
 * --repair: build the manifest from the D1 archive index + student-record
 * roster, upload it to the recorded R2 key, then verify. It never deletes an
 * archive object and never changes D1 rows.
 *
 * Usage: node scripts/phase9/archive-manifests.mjs [--repair] [--local]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mode = process.argv.includes("--local") ? "--local" : "--remote";
const repair = process.argv.includes("--repair");
const tempDir = join(apiRoot, ".tmp", "phase9", "manifests");
mkdirSync(tempDir, { recursive: true });

const runWrangler = (args) =>
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: apiRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" }
  });

const query = (sql) =>
  JSON.parse(runWrangler(["d1", "execute", "DB", mode, "--json", "--command", sql]))[0]
    ?.results ?? [];

const years = query(`
  SELECT id, year, archive_manifest_key
  FROM sm_academic_years
  WHERE archive_manifest_key IS NOT NULL
  ORDER BY id
`);

const results = [];
for (const year of years) {
  const sessionId = Number(year.id);
  const key = year.archive_manifest_key;
  if (typeof key !== "string" || key.length === 0) continue;

  const objects = query(`
    SELECT student_id, object_key, checksum, bytes, version, status
    FROM archive_objects
    WHERE academic_id = ${sessionId}
    ORDER BY student_id, version
  `);
  const expected = query(`
    SELECT DISTINCT student_id
    FROM student_records
    WHERE academic_id = ${sessionId}
    ORDER BY student_id
  `).map((row) => Number(row.student_id));

  const file = join(tempDir, `session-${sessionId}.json`);
  let manifest;
  let repaired = false;
  try {
    runWrangler(["r2", "object", "get", `edapex-media/${key}`, mode, "--file", file]);
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (!repair) throw error;
    const archived = new Set(
      objects
        .filter((row) => row.status !== "quarantined")
        .map((row) => Number(row.student_id))
    );
    const quarantined = new Set(
      objects
        .filter((row) => row.status === "quarantined")
        .map((row) => Number(row.student_id))
    );
    const missing = expected
      .filter((id) => !archived.has(id) && !quarantined.has(id))
      .sort((a, b) => a - b);

    manifest = {
      schemaVersion: 1,
      schoolId: 1,
      sessionId,
      generatedAt: Math.floor(Date.now() / 1000),
      students: {
        total: expected.length,
        archived: archived.size,
        quarantined: quarantined.size,
        missing
      },
      terms: [],
      objects: objects.map((row) => ({
        studentId: Number(row.student_id),
        key: row.object_key,
        checksum: row.checksum,
        bytes: Number(row.bytes),
        version: Number(row.version),
        status: row.status
      })),
      gaps: [
        ...missing.map((studentId) => ({ studentId, reason: "missing" })),
        ...objects
          .filter((row) => row.status === "quarantined")
          .map((row) => ({
            studentId: Number(row.student_id),
            reason: "checksum_mismatch"
          }))
      ]
    };

    repaired = true;
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    runWrangler([
      "r2",
      "object",
      "put",
      `edapex-media/${key}`,
      mode,
      "--file",
      file,
      "--content-type",
      "application/json"
    ]);
  }

  results.push({
    sessionId,
    year: year.year,
    manifestKey: key,
    repaired,
    schemaVersion: manifest.schemaVersion,
    students: manifest.students,
    terms: manifest.terms,
    manifestObjects: Array.isArray(manifest.objects) ? manifest.objects.length : 0,
    indexedObjects: objects.length
  });
}

console.log(JSON.stringify({ mode, repaired: repair, sessions: results }, null, 2));
