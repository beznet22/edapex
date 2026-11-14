#!/usr/bin/env node
/**
 * Build the browser agent runtime and enforce its size budget.
 *
 * The WASM bundle is the replacement for the 9.9 MB xcodex payload, so its size
 * is a gate rather than a report: a regression that doubles the bundle would
 * otherwise ship silently.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "agent-runtime");
const crate = "edapex-agent-wasm";
const wasmName = "edapex_agent_wasm";

/**
 * The Cargo target directory lives at the workspace root, which is two levels
 * above this app. Resolving it explicitly avoids depending on the shell's cwd.
 */
const workspaceRoot = join(root, "..", "..");
const wasmArtifact = join(
  workspaceRoot,
  "target",
  "wasm32-unknown-unknown",
  "release",
  `${wasmName}.wasm`
);

/** Budgets in bytes, measured on the compressed payload the browser downloads. */
const BUDGET = {
  wasmGzip: 1_200_000,
  jsGzip: 60_000
};

const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: "inherit" });

console.log(`Building ${crate} for wasm32-unknown-unknown…`);
run(
  "cargo",
  ["build", "--target", "wasm32-unknown-unknown", "--release", "-p", crate],
  workspaceRoot
);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log("Running wasm-bindgen…");
run("wasm-bindgen", [
  "--target",
  "web",
  "--out-dir",
  outDir,
  "--out-name",
  wasmName,
  wasmArtifact
]);

const measure = (name) => {
  const bytes = readFileSync(join(outDir, name));
  return { raw: bytes.byteLength, gzip: gzipSync(bytes, { level: 9 }).byteLength };
};

const wasm = measure(`${wasmName}_bg.wasm`);
const js = measure(`${wasmName}.js`);

const report = (label, size, budget) => {
  const status = size.gzip <= budget ? "ok" : "OVER BUDGET";
  console.log(
    `${label}: ${size.raw} raw, ${size.gzip} gzip (budget ${budget}) — ${status}`
  );
  return size.gzip <= budget;
};

const withinBudget =
  report("agent wasm", wasm, BUDGET.wasmGzip) &
  report("agent js glue", js, BUDGET.jsGzip);

if (!withinBudget) {
  console.error("Agent runtime exceeded its size budget.");
  process.exit(1);
}

// Sanity check: the entry point the app imports must exist and be non-trivial.
const entryBytes = statSync(join(outDir, `${wasmName}.js`)).size;
if (entryBytes < 1_000) {
  console.error(`Generated glue looks truncated (${entryBytes} bytes).`);
  process.exit(1);
}

console.log("Agent runtime built.");
