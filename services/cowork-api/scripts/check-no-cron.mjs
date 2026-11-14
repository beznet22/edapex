#!/usr/bin/env node
/**
 * Asserts no Worker in this repo can be invoked on a schedule.
 *
 * This lives outside Vitest on purpose. The `cowork-api` suite runs inside the
 * workerd sandbox, which cannot read the real filesystem — a version of this check
 * there passed vacuously, because `readFileSync` threw and a `catch` skipped it.
 * A gate that passes when it cannot read its input is worse than no gate.
 *
 * The rule being protected (spec 41): routines run on the device, never on a
 * Worker cron. A hundred tenants with per-routine cron fan-out would exceed the
 * account-wide D1 write cap, and one documented incident already reached 148,861
 * writes in a day.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const servicesDir = join(root, "services");

/** A Worker can be scheduled via an export or via a config trigger. Both are checked. */
const EXPORT_PATTERNS = [
  { pattern: /\bscheduled\s*[:(]/, what: "a `scheduled` export" },
  { pattern: /async\s+scheduled\s*\(/, what: "an async `scheduled` handler" }
];

const CONFIG_PATTERN = { pattern: /"crons"\s*:/, what: "a `triggers.crons` entry" };

const violations = [];
let checked = 0;

for (const name of readdirSync(servicesDir, { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  const dir = join(servicesDir, name.name);

  const entry = join(dir, "src", "worker.ts");
  if (existsSync(entry)) {
    checked += 1;
    const source = readFileSync(entry, "utf8");
    for (const rule of EXPORT_PATTERNS) {
      if (rule.pattern.test(source)) {
        violations.push(`${name.name}/src/worker.ts declares ${rule.what}`);
      }
    }
  }

  const config = join(dir, "wrangler.jsonc");
  if (existsSync(config)) {
    const source = readFileSync(config, "utf8");
    if (CONFIG_PATTERN.pattern.test(source)) {
      violations.push(`${name.name}/wrangler.jsonc declares ${CONFIG_PATTERN.what}`);
    }
  }
}

if (checked === 0) {
  // Silence when nothing was inspected is the failure mode this script exists to
  // avoid: it would pass on a broken path.
  console.error("cron check failed: no Worker entries were found. Check the path.");
  process.exit(1);
}

if (violations.length > 0) {
  console.error("cron check failed:");
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    "\nRoutines run on the device (spec 41). Do not add a scheduled handler or a\n" +
      "cron trigger to any Worker."
  );
  process.exit(1);
}

console.log(`cron check passed: ${checked} Worker entry(ies) inspected, no schedules`);
