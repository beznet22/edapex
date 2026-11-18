#!/usr/bin/env node
/**
 * Size gate for both agent artifacts.
 *
 * Two budgets, because the browser does not ship the native binary and a gate
 * that measures the wrong one reads as a pass while the shipped bundle grows
 * unchecked:
 *
 * 1. **Native core** — the `agent_size` example in the `agent-release` profile.
 * 2. **Browser core** — the `wasm32` release build of `edapex-agent-wasm`.
 *
 * The wasm figure is an upper bound, not the bundle: `[profile.release]` keeps
 * `strip = "none"` on purpose (wasm-bindgen needs the `target_features` section)
 * and the shipped size comes from `wasm-opt`. Measuring the cargo artefact still
 * catches the thing that matters — a dependency or a code path that makes the
 * browser runtime balloon — without needing the wasm-bindgen toolchain here.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const CORE_LIMIT = 10 * 1024 * 1024;
const WASM_LIMIT = 5 * 1024 * 1024;
const targetDir = process.env.CARGO_TARGET_DIR ?? "target";

const mib = (bytes) => (bytes / (1024 * 1024)).toFixed(2);

const build = (args) => execFileSync("cargo", args, { stdio: "inherit" });

/** Report one artifact and return whether it fits. */
function measure(path, label, limit) {
  if (!existsSync(path)) {
    console.error(`${label}: artifact missing at ${path}`);
    return false;
  }
  const bytes = statSync(path).size;
  console.log(`${label}: ${bytes} bytes (${mib(bytes)} MiB), budget ${mib(limit)} MiB`);
  if (bytes > limit) {
    console.error(`${label} exceeds its ${mib(limit)} MiB budget`);
    return false;
  }
  return true;
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

build([
  "build",
  "--target",
  "wasm32-unknown-unknown",
  "--release",
  "-p",
  "edapex-agent-wasm"
]);

const wasmFits = measure(
  join(targetDir, "wasm32-unknown-unknown", "release", "edapex_agent_wasm.wasm"),
  "agent core (wasm32, pre-wasm-opt)",
  WASM_LIMIT
);

if (!nativeFits || !wasmFits) process.exit(1);
