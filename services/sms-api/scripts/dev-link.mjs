#!/usr/bin/env node
/**
 * Requests a magic link from the local API and prints it.
 *
 * On a local Worker there is no `send_email` binding, so `LOCAL_EMAIL_LOG=true` swaps the
 * transport for one that writes to stdout. That is the right trade — the alternative is a 202
 * for an email that never leaves — but it means the link appears in the `wrangler dev`
 * terminal rather than the person's inbox, and scrolling back through that terminal for a
 * 64-character token is a worse experience than it needs to be.
 *
 * This requests a fresh link and reads it back from the API log.
 *
 *   pnpm --dir services/sms-api dev:link onosbrown.saved@gmail.com
 *
 * Assumes `wrangler dev` is running with `LOCAL_EMAIL_LOG=true` (see `.dev.vars.example`).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API = process.env.LOCAL_API ?? "http://localhost:8787";
const email = process.argv[2];

if (typeof email !== "string" || !email.includes("@")) {
  console.error("Usage: pnpm --dir services/sms-api dev:link <email>");
  process.exit(1);
}

/**
 * Finds the log to tail.
 *
 * `pnpm dev` in a terminal writes to that terminal, not a file, so there is nothing to read.
 * The script therefore asks for the link and then tells the person where to look, rather
 * than pretending it can always find it. `LOCAL_API_LOG` overrides; otherwise the common
 * `/tmp` names are tried so a backgrounded server works out of the box.
 */
function findLog() {
  if (process.env.LOCAL_API_LOG !== undefined) return process.env.LOCAL_API_LOG;
  const candidates = [
    "/tmp/api-local2.log",
    "/tmp/api-local.log",
    "/tmp/api.log"
  ].filter((path) => existsSync(path));
  if (candidates.length === 0) return null;
  // Newest first: a restarted server writes a new file.
  return candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

const before = (() => {
  const log = findLog();
  return log === null ? "" : readFileSync(log, "utf8").length;
})();

let status = 0;
try {
  const response = await fetch(`${API}/api/v1/auth/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email })
  });
  status = response.status;
  if (!response.ok) {
    const body = await response.text();
    console.error(`Request failed (${response.status}): ${body}`);
    process.exit(1);
  }
} catch (cause) {
  console.error(`Could not reach the local API at ${API}.`);
  console.error(`Is \`pnpm --dir services/sms-api dev\` running?`);
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exit(1);
}

// The send is awaited before the 202 returns, so the line is already written; the delay only
// covers stdout flushing.
await new Promise((resolve) => setTimeout(resolve, 400));

const log = findLog();
const printed = log === null ? "" : readFileSync(log, "utf8").slice(before);
const match = /link:\s+(\S+)/.exec(printed);

if (match === null) {
  console.log(`Requested a sign-in link for ${email} (HTTP ${status}).`);
  console.log("");
  console.log("The link is in the `wrangler dev` terminal — look for the 'local email' block.");
  console.log("Set LOCAL_API_LOG=/path/to/log to have this script read it instead.");
  process.exit(0);
}

console.log(`Sign-in link for ${email}:`);
console.log("");
console.log(`  ${match[1]}`);
console.log("");
console.log("Works once, expires in 15 minutes.");
