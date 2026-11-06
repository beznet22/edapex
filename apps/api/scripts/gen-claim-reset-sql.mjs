#!/usr/bin/env node
/**
 * Prints the one-time shared-digest reset for the source MySQL (`04a §2.2`).
 *
 * No MySQL driver is added: the statements are generated and run by whoever
 * holds the source credentials, in the same maintenance window as the cutover.
 */
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const password = valueOf("--password");
const suppliedDigest = valueOf("--digest");
const digest =
  password !== undefined
    ? createHash("sha256").update(password).digest("hex")
    : suppliedDigest?.toLowerCase();

if (digest === undefined || !/^[0-9a-f]{64}$/.test(digest)) {
  console.error(
    "usage: node scripts/gen-claim-reset-sql.mjs (--password <plaintext> | --digest <64-hex sha256>)"
  );
  process.exit(1);
}

console.log("-- 04a §2.2 one-time shared-digest reset (source MySQL).");
console.log("-- Run inside the maintenance window, immediately before traffic moves.");
console.log(`-- digest: ${digest}`);
console.log("");
console.log("SET autocommit = 0;");
console.log("BEGIN;");
console.log(`UPDATE users SET password = '${digest}' WHERE email IS NOT NULL;`);
console.log("COMMIT;");
console.log("");
console.log("-- Verification: both counts must match the expected population.");
console.log("SELECT COUNT(*) AS claimable FROM users WHERE email IS NOT NULL;");
console.log(
  `SELECT COUNT(*) AS matching FROM users WHERE email IS NOT NULL AND password = '${digest}';`
);
console.log("");
console.log("-- Do not run this against D1 by hand. Use the admin route instead:");
console.log("--   POST /api/v1/admin/auth/claim-reset { \"confirm\": \"RESET_ALL_PASSWORDS\" }");
