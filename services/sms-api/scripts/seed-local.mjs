#!/usr/bin/env node
/**
 * Seeds a local D1 with the minimum a workspace needs to render: one school, one admin
 * and one teacher.
 *
 * # Why this exists
 *
 * The web app carried a dev auth bypass because there was no way to sign in locally — not
 * because the bypass was a good idea. `wrangler dev` has no email binding, the magic-link
 * adapter throws, and the D1 starts empty: no school, no user, no role. Signing in would
 * fail even if the email arrived.
 *
 * This closes the second half. Pair it with `LOCAL_EMAIL_LOG=true` and magic-link sign-in
 * works end to end on a fresh clone:
 *
 *   pnpm --dir services/sms-api db:migrate:local
 *   node services/sms-api/scripts/seed-local.mjs
 *   LOCAL_EMAIL_LOG=true pnpm --dir services/sms-api dev
 *
 * # What it does not do
 *
 * No students, marks, attendance or results. A seeded school with fake marks is data
 * somebody will eventually mistake for real, and every screen that needs them already says
 * it is empty. The accounts are the blocker; the content is not.
 */

import { execFileSync } from "node:child_process";

/**
 * The binding name from `wrangler.jsonc`, not a made-up one.
 *
 * `wrangler d1 execute` resolves the name against that file and fails with "Couldn't find
 * a D1 DB with the name or binding" otherwise — which is how this constant got corrected.
 */
const DB = "edapex-recovery";
const NOW = Math.floor(Date.now() / 1000);

const ADMIN_EMAIL = process.env["SEED_ADMIN_EMAIL"] ?? "admin@edapex.test";
const TEACHER_EMAIL = process.env["SEED_TEACHER_EMAIL"] ?? "teacher@edapex.test";

/** `wrangler d1 execute` with the local flag, returning parsed JSON rows. */
function sql(statement) {
  const output = execFileSync(
    "wrangler",
    [
      "d1",
      "execute",
      DB,
      "--local",
      "--json",
      "--command",
      statement
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  // `--json` prints an array per statement; we only ever ask for one.
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function escape(value) {
  return String(value).replace(/'/g, "''");
}

function main() {
  // Idempotent by email rather than by id: re-running must not create a second admin,
  // and a fixed id would collide with whatever the migration seeded first.
  const existing = sql(
    `SELECT id, email FROM users WHERE email IN ('${escape(ADMIN_EMAIL)}', '${escape(TEACHER_EMAIL)}')`
  );
  const rows = Array.isArray(existing?.[0]?.results) ? existing[0].results : [];
  if (rows.length >= 2) {
    console.log(`Seed already present: ${rows.map((r) => r.email).join(", ")}`);
    return;
  }

  const school = sql(
    "SELECT id FROM sm_schools ORDER BY id LIMIT 1"
  );
  const schoolRows = Array.isArray(school?.[0]?.results) ? school[0].results : [];
  let schoolId = schoolRows[0]?.id;

  if (schoolId === undefined) {
    sql(
      `INSERT INTO sm_schools (school_name, email, domain, created_by, updated_by)
       VALUES ('Local Test School', 'office@localhost', 'localhost', 1, 1)`
    );
    const created = sql("SELECT id FROM sm_schools ORDER BY id DESC LIMIT 1");
    schoolId = created?.[0]?.results?.[0]?.id;
  }

  if (schoolId === undefined) {
    console.error("Could not create a school. Run the migrations first.");
    process.exit(1);
  }

  /*
   * Column names are taken from the migrated schema, not from the Drizzle file: the
   * physical table says `usertype`, and `is_administrator` is a `"yes"`/`"no"` text flag,
   * not a boolean. Both are legacy Laravel shapes that the ORM maps over.
   */
  for (const [email, name, isAdmin] of [
    [ADMIN_EMAIL, "Local Admin", true],
    [TEACHER_EMAIL, "Local Teacher", false]
  ]) {
    sql(
      `INSERT INTO users (full_name, username, email, usertype, active_status, is_administrator, email_verified_at, school_id, created_at, updated_at)
       VALUES ('${escape(name)}', '${escape(email.split("@")[0])}', '${escape(email)}',
               'staff', 1, '${isAdmin ? "yes" : "no"}', ${NOW}, ${Number(schoolId)}, ${NOW}, ${NOW})`
    );
  }

  console.log(`Seeded school ${schoolId} with ${ADMIN_EMAIL} and ${TEACHER_EMAIL}.`);
  console.log("");
  console.log("Start the API with the local email transport:");
  console.log("  LOCAL_EMAIL_LOG=true pnpm --dir services/sms-api dev");
  console.log("");
  console.log(`Then request a magic link for ${ADMIN_EMAIL} and read the URL from the API log.`);
}

main();
