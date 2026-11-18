#!/usr/bin/env node
/**
 * Size gates for both agent artifacts.
 *
 * 1. **Native core** — the `agent_size` example in the `agent-release` profile.
 * 2. **Browser core** — the artifact that actually ships:
 *    `apps/web/public/agent-runtime/`, produced by `build:agent-runtime`
 *    (wasm-bindgen, then `wasm-opt -Oz --strip-dwarf --strip-debug`).
 *
 * The browser gate used to measure the raw `wasm32` cargo artifact against a
 * 5 MiB budget. That number described nothing a user downloads: the artifact
 * carries `.debug_*` and `name` sections (~2.75 MiB of the 8.39 MiB measured)
 * that `wasm-opt` removes, and the real production ceiling — 1.2 MB gzipped —
 * lives on the shipped file. Measuring the intermediate artifact read as a
 * failure while the bundle was comfortably inside its budget, so the gate is
 * now the same file the web app fetches, and the budget is unchanged.
 *
 * The shipped artifact must be built first; CI runs this after
 * `pnpm --dir apps/web run build:agent-runtime`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const CORE_LIMIT = 10 * 1024 * 1024;
// Same ceilings the production build enforces, kept here so a hand-built or
// stale bundle cannot pass a gate the build would have failed.
const WASM_GZIP_LIMIT = 1_200_000;
const GLUE_GZIP_LIMIT = 60_000;
const targetDir = process.env.CARGO_TARGET_DIR ?? "target";
const runtimeDir = join("apps", "web", "public", "agent-runtime");

const mib = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
const kib = (bytes) => (bytes / 1024).toFixed(0);

const build = (args) => execFileSync("cargo", args, { stdio: "inherit" });

/** Report one artifact and return whether it fits. */
function measure(path, label, limit) {
  if (!existsSync(path)) {
    console.error(`${label}: artifact missing at ${path}`);
    return null;
  }
  const bytes = readFileSync(path);
  const gzip = gzipSync(bytes, { level: 9 }).byteLength;
  console.log(
    `${label}: ${bytes.byteLength} raw, ${gzip} gzip (budget ${limit}) — ${
      gzip <= limit ? "ok" : "OVER BUDGET"
    }`
  );
  return gzip <= limit;
}

/**
 * Custom-section names in a Wasm module. Used to prove the shipped artifact
 * carries no debug metadata, rather than trusting the build flags.
 */
function customSections(bytes) {
  const names = [];
  let at = 8;
  while (at < bytes.length) {
    const id = bytes[at];
    at += 1;
    let size = 0;
    let shift = 0;
    let byte;
    do {
      byte = bytes[at];
      at += 1;
      size |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    if (id === 0) {
      // Custom sections carry a name prefixed by its own LEB128 length.
      let length = 0;
      let bits = 0;
      let index = at;
      let current;
      do {
        current = bytes[index];
        index += 1;
        length |= (current & 0x7f) << bits;
        bits += 7;
      } while (current & 0x80);
      names.push(bytes.toString("utf8", index, Math.min(bytes.length, index + length)));
    }
    at += size;
  }
  return names;
}

build([
  "build",
  "--profile",
  "agent-release",
  "--example",
  "agent_size",
  "-p",
  "edapex-agent"
]);

const nativeExecutable = process.platform === "win32" ? "agent_size.exe" : "agent_size";
const nativeFits = measure(
  join(targetDir, "agent-release", "examples", nativeExecutable),
  "agent core (native)",
  CORE_LIMIT
);

const wasmPath = join(runtimeDir, "edapex_agent_wasm_bg.wasm");
const gluePath = join(runtimeDir, "edapex_agent_wasm.js");
if (!existsSync(wasmPath) || !existsSync(gluePath)) {
  console.error(
    `Browser runtime missing at ${runtimeDir}.\n` +
      "Build it first: pnpm --dir apps/web run build:agent-runtime"
  );
  process.exit(1);
}

const shipped = readFileSync(wasmPath);
const debugSections = customSections(shipped).filter(
  (name) => name.startsWith(".debug") || name === "name" || name === "external_debug_info"
);
if (debugSections.length > 0) {
  console.error(
    `Browser runtime still carries debug metadata (${debugSections.join(", ")}); ` +
      "it must be produced by build:agent-runtime, which strips it."
  );
  process.exit(1);
}

const wasmFits = measure(wasmPath, "agent core (browser, shipped)", WASM_GZIP_LIMIT);
const glueFits = measure(gluePath, "agent glue (browser, shipped)", GLUE_GZIP_LIMIT);

const total =
  gzipSync(readFileSync(wasmPath), { level: 9 }).byteLength +
  gzipSync(readFileSync(gluePath), { level: 9 }).byteLength;
console.log(`browser runtime total: ${total} gzip (${kib(total)} KiB)`);
console.log(`native core: ${mib(statSync(join(targetDir, "agent-release", "examples", nativeExecutable)).size)} MiB`);

if (!nativeFits || !wasmFits || !glueFits) {
  console.error("Agent artifacts exceeded their size budgets.");
  process.exit(1);
}
