#!/usr/bin/env node
/**
 * Documentation that cannot rot.
 *
 * A map that omits a package is worse than no map: it teaches the next agent that the file
 * is optional. These checks are cheap and they catch the four ways this document has
 * already gone stale.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const problems = [];
const fail = (message) => problems.push(message);

const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");

function dirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

// 1. Every package on disk appears in the map.
for (const name of dirs(join(ROOT, "packages"))) {
  if (!agents.includes(`\`${name}\``)) fail(`AGENTS.md map does not list packages/${name}`);
}

// 2. Every app, crate and service on disk appears in the map.
for (const dir of ["apps", "crates", "services"]) {
  for (const name of dirs(join(ROOT, dir))) {
    const label = dir === "apps" ? `apps/${name}` : name;
    if (!agents.includes(`\`${label}\``)) fail(`AGENTS.md map does not mention ${dir}/${name}`);
  }
}

// 3. Every spec path referenced from AGENTS.md resolves.
for (const match of agents.matchAll(/\((docs\/[^)#]+)\)/g)) {
  try {
    statSync(join(ROOT, match[1]));
  } catch {
    fail(`AGENTS.md links to a missing file: ${match[1]}`);
  }
}

// 4. Every spec declares a Status line.
for (const name of dirs(join(ROOT, "docs/workspace/specs")).filter((entry) => entry.endsWith(".md"))) {
  const file = join(ROOT, "docs/workspace/specs", name);
  if (statSync(file).isDirectory()) continue;
  const text = readFileSync(file, "utf8");
  if (!/Status:/.test(text.slice(0, 2000))) fail(`docs/workspace/specs/${name} has no Status: line`);
}

// 5. The Android package identity agrees in all three places.
//
// Reading the java directory as a file threw EISDIR, and the surrounding catch swallowed
// the whole assertion — so this check passed while asserting nothing. Walk for the source
// and read its `package` line instead.
function kotlinPackages(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...kotlinPackages(full));
    else if (entry.name.endsWith(".kt")) {
      const match = /^package\s+([\w.]+)/m.exec(readFileSync(full, "utf8"));
      if (match) found.push({ file: full, name: match[1] });
    }
  }
  return found;
}

try {
  const conf = JSON.parse(readFileSync(join(ROOT, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"));
  const gradle = readFileSync(join(ROOT, "apps/desktop/src-tauri/gen/android/app/build.gradle.kts"), "utf8");
  const appId = /applicationId\s*=\s*"([^"]+)"/.exec(gradle)?.[1];
  const namespace = /namespace\s*=\s*"([^"]+)"/.exec(gradle)?.[1];

  if (appId !== undefined && conf.identifier !== appId) {
    fail(`tauri identifier (${conf.identifier}) !== gradle applicationId (${appId})`);
  }
  if (namespace !== undefined && namespace !== appId) {
    fail(`gradle namespace (${namespace}) !== applicationId (${appId})`);
  }

  const sources = kotlinPackages(join(ROOT, "apps/desktop/src-tauri/gen/android/app/src/main/java"));
  if (sources.length === 0) fail("no Kotlin sources under gen/android/app/src/main/java");
  for (const source of sources) {
    if (source.name !== appId) {
      fail(`${relative(ROOT, source.file)} is package ${source.name}, expected ${appId}`);
    }
  }
} catch (cause) {
  fail(`the Android package identity could not be checked: ${cause.message}`);
}

// 6. The workspace globs cover every app and package directory.
try {
  const workspace = readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8");
  for (const dir of ["apps", "packages"]) {
    for (const name of dirs(join(ROOT, dir))) {
      const exact = `${dir}/${name}`;
      const covered =
        workspace.includes(exact) ||
        (dir === "packages" && workspace.includes("packages/*"));
      if (!covered) fail(`pnpm-workspace.yaml does not cover ${exact}`);
    }
  }
} catch {
  fail("pnpm-workspace.yaml is missing");
}

if (problems.length > 0) {
  console.error("Documentation drift (see AGENTS.md → Process):\n");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log("ok  docs: map matches disk, specs resolve, package identity agrees");
