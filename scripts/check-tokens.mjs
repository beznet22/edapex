#!/usr/bin/env node
/**
 * The token ratchet.
 *
 * `apps/web` predates the no-arbitrary-values rule and contains real violations. A rule the
 * main app breaks on day one is theatre, so the check ships with a baseline: the count per
 * file may not grow, and fixing a violation requires lowering the baseline in the same
 * commit. `apps/desktop/mobile` has no baseline and never will — it starts clean.
 *
 * `packages/ui` is not scanned. Its contents are shadcn-vendored, and rewriting the
 * registry's own arbitrary values is churn we would redo on every `shadcn add`.
 *
 * Usage: node scripts/check-tokens.mjs [--update]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASELINE_PATH = join(ROOT, "scripts/token-baseline.json");
const SCAN = ["apps/web", "apps/desktop/mobile"];
const STRICT = ["apps/desktop/mobile"];
const SKIP = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".cloudflare",
  ".wrangler",
  "target",
  "gen",
  "public",
  "test-results",
  "playwright-report",
]);

/** `[12px]`, `[#fff]`, `[rgb(...)]`, `[oklch(...)]`, `[calc(...)]` — a value, not a variant. */
const ARBITRARY = /\[[^\]]*(?:\d+px|\d+rem|#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(|calc\()/g;

function files(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function violations(file) {
  const source = readFileSync(file, "utf8");
  const hits = [];
  for (const match of source.matchAll(ARBITRARY)) {
    // A CSS custom property is a token reference, not a hardcoded value.
    if (/^\[var\(--(radius|elevation|spacing|motion|text|color|shadow)/.test(match[0])) continue;
    const line = source.slice(0, match.index).split("\n").length;
    hits.push({ line, value: match[0] });
  }
  return hits;
}

const found = {};
for (const root of SCAN) {
  for (const file of files(join(ROOT, root))) {
    const hits = violations(file);
    if (hits.length > 0) found[relative(ROOT, file)] = hits;
  }
}

const baseline = JSON.parse(
  (() => {
    try {
      return readFileSync(BASELINE_PATH, "utf8");
    } catch {
      return "{}";
    }
  })()
);

if (process.argv.includes("--update")) {
  const next = Object.fromEntries(
    Object.entries(found)
      .map(([file, hits]) => [file, hits.length])
      .sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`token-baseline.json written: ${Object.values(next).reduce((a, b) => a + b, 0)} violations across ${Object.keys(next).length} files`);
  process.exit(0);
}

const problems = [];

for (const [file, hits] of Object.entries(found)) {
  const allowed = baseline[file] ?? 0;
  const strict = STRICT.some((prefix) => file.startsWith(prefix));
  if (strict || hits.length > allowed) {
    for (const hit of hits.slice(allowed)) {
      problems.push(`${file}:${hit.line}  ${hit.value}`);
    }
  }
}

for (const [file, allowed] of Object.entries(baseline)) {
  const current = found[file]?.length ?? 0;
  if (current < allowed) {
    problems.push(
      `${file}  baseline says ${allowed}, found ${current} — lower scripts/token-baseline.json in this commit`
    );
  }
}

if (problems.length > 0) {
  console.error("Arbitrary Tailwind values (see AGENTS.md → Design values):\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} problem(s). Use a token utility, or the documented escape.`);
  process.exit(1);
}

const total = Object.values(found).reduce((sum, hits) => sum + hits.length, 0);
console.log(`ok  token ratchet: ${total} baselined violation(s), none new`);
