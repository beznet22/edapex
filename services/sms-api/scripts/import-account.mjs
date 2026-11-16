#!/usr/bin/env node
/**
 * Copies one production account into the local D1 so you can sign in locally.
 *
 * # Why this exists
 *
 * The local D1 starts with only the seeded users from `seed-local.mjs`. A real admin account
 * — with its linked Google identity, role and school — lives in production, and the local
 * API silently no-ops a magic link for an address it does not know. The result is a 202 and
 * no email, which looks like a mail failure rather than a missing row.
 *
 * This reads the row from the **remote** database and writes it locally. It never writes to
 * production.
 *
 *   node services/sms-api/scripts/import-account.mjs onosbrown.saved@gmail.com
 *
 * # What it copies
 *
 * The `users` row and any `auth_identities` for it. Not the school, parents, students or
 * marks — a local session only needs an identity, and copying a school's worth of data into
 * a dev database is how people end up testing against a stale fixture they believe is real.
 */

import { execFileSync } from "node:child_process";

const DB = "edapex-recovery";
const email = process.argv[2];

if (typeof email !== "string" || !email.includes("@")) {
  console.error("Usage: node scripts/import-account.mjs <email>");
  process.exit(1);
}

/** Runs one statement and returns its rows, or throws with the statement attached. */
function query(where, statement) {
  const args = [
    "d1",
    "execute",
    DB,
    where === "remote" ? "--remote" : "--local",
    "--json",
    "--command",
    statement
  ];
  const output = execFileSync("wrangler", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const start = output.indexOf("[");
  if (start < 0) return [];
  return JSON.parse(output.slice(start))?.[0]?.results ?? [];
}

function escape(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

const rows = query("remote", `SELECT * FROM users WHERE email = ${escape(email)} LIMIT 1`);
const user = rows[0];

if (user === undefined) {
  console.error(`No account with that email in the remote database.`);
  process.exit(1);
}

/**
 * Copy the reference rows the user points at.
 *
 * `users.role_id` and `users.school_id` are foreign keys, and a bare local database has an
 * empty `infix_roles` — so importing the user alone fails with
 * `FOREIGN KEY constraint failed`. Copying the one role and school the account actually
 * references is enough to satisfy the constraint without pretending the local database is a
 * full replica of production.
 */
function copyReference(table, id) {
  if (id === null || id === undefined) return;
  const found = query("remote", `SELECT * FROM ${table} WHERE id = ${Number(id)} LIMIT 1`);
  const row = found[0];
  if (row === undefined) return;
  const cols = Object.keys(row);
  query(
    "local",
    `INSERT OR REPLACE INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols
      .map((c) => escape(row[c]))
      .join(", ")})`
  );
  console.log(`  copied ${table} id ${id}`);
}

copyReference("sm_schools", user.school_id);
copyReference("infix_roles", user.role_id);

/*
 * The academic years for the school.
 *
 * The web client sends `X-Academic-Id` on every tenant request and defaults to 5, so a local
 * database with no academic years fails `assertScope` with "The academic year does not belong
 * to this school" — which reads as a permissions problem rather than an empty table.
 */
const years = query(
  "remote",
  `SELECT * FROM sm_academic_years WHERE school_id = ${Number(user.school_id)}`
);
for (const year of years) {
  const cols = Object.keys(year);
  query(
    "local",
    `INSERT OR REPLACE INTO sm_academic_years (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols
      .map((c) => escape(year[c]))
      .join(", ")})`
  );
}
if (years.length > 0) console.log(`  copied ${years.length} academic years`);

const columns = Object.keys(user);
const values = columns.map((column) => escape(user[column])).join(", ");

// `INSERT OR REPLACE` so re-running after a production change updates rather than fails on
// the primary key.
query(
  "local",
  `INSERT OR REPLACE INTO users (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values})`
);

const identities = query(
  "remote",
  `SELECT * FROM auth_identities WHERE user_id = ${Number(user.id)}`
);
for (const identity of identities) {
  const identityColumns = Object.keys(identity);
  const identityValues = identityColumns.map((column) => escape(identity[column])).join(", ");
  query(
    "local",
    `INSERT OR REPLACE INTO auth_identities (${identityColumns.map((c) => `"${c}"`).join(", ")}) VALUES (${identityValues})`
  );
}

console.log(`Imported ${email} (id ${user.id}) into the local D1.`);
console.log(`  admin:    ${user.is_administrator === "yes" ? "yes" : "no"}`);
console.log(`  school:   ${user.school_id}`);
console.log(`  status:   ${user.active_status === 1 ? "active" : "inactive"}`);
console.log(`  identities: ${identities.length}`);
console.log("");
console.log("Then request a magic link and read the URL from the API log:");
console.log("  curl -X POST http://localhost:8787/api/v1/auth/magic-link \\");
console.log(`       -H 'content-type: application/json' -d '{"email":"${email}"}'`);
