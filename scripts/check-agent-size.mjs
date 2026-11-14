#!/usr/bin/env node
/**
 * Build the agent size fixture in the dedicated `agent-release` profile and
 * fail when the stripped binary exceeds the 10 MB core budget.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 10 * 1024 * 1024;
const targetDir = process.env.CARGO_TARGET_DIR ?? "target";
const executable = process.platform === "win32" ? "agent_size.exe" : "agent_size";

execFileSync(
  "cargo",
  ["build", "--profile", "agent-release", "--example", "agent_size", "-p", "edapex-agent"],
  { stdio: "inherit" }
);

const path = join(targetDir, "agent-release", "examples", executable);
if (!existsSync(path)) {
  console.error(`size artifact missing: ${path}`);
  process.exit(1);
}

const bytes = statSync(path).size;
const mib = bytes / (1024 * 1024);
console.log(`agent core: ${bytes} bytes (${mib.toFixed(2)} MiB), budget ${LIMIT / (1024 * 1024)} MiB`);
if (bytes > LIMIT) {
  console.error("agent core exceeds the 10 MiB budget");
  process.exit(1);
}
