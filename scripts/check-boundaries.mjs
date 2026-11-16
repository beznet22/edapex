#!/usr/bin/env node
/**
 * Package boundaries, naming and structure.
 *
 * One rule per concern, each one something a reviewer would otherwise have to remember on
 * every PR. Fails with the offending file and line so the fix is obvious from CI alone.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", "dist", "build", ".next", ".cloudflare", ".wrangler", "target", "gen", "public", "test-results"]);

const BANNED_STEMS = /[/](helpers|misc|common|manager|types)\.(ts|tsx)$/;
const BANNED_UTILS = /[/]utils\.(ts|tsx)$/;

const problems = [];
const fail = (file, line, message) => problems.push(`${relative(ROOT, file)}:${line}  ${message}`);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function lines(file) {
  return readFileSync(file, "utf8").split("\n");
}

/** Every import specifier in a file, with its 1-indexed line. */
function imports(file) {
  const out = [];
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:from\s+|import\()\s*["']([^"']+)["']/g)) {
    const line = source.slice(0, match.index).split("\n").length;
    out.push({ specifier: match[1], line });
  }
  return out;
}

const groups = {
  web: walk(join(ROOT, "apps/web")),
  mobile: walk(join(ROOT, "apps/desktop/mobile")),
  packages: walk(join(ROOT, "packages"))
};

// 1. No app imports another app.
for (const [name, files] of Object.entries({ web: groups.web, mobile: groups.mobile })) {
  const other = name === "web" ? "apps/desktop" : "apps/web";
  for (const file of files) {
    for (const { specifier, line } of imports(file)) {
      if (specifier.includes(other)) fail(file, line, `an app may not import ${other}`);
    }
  }
}

// 2. No package imports an app, and no `@/` alias outside an app.
for (const file of groups.packages) {
  for (const { specifier, line } of imports(file)) {
    if (specifier.startsWith("apps/") || specifier.includes("/apps/")) {
      fail(file, line, "a package may not import an app");
    }
    if (specifier.startsWith("@/")) {
      fail(file, line, '`@/` is an app alias; a package must use its own specifier');
    }
  }
}

// 3. packages/ui is primitive-only: no Next, no Tauri.
for (const file of groups.packages) {
  if (!relative(ROOT, file).startsWith("packages/ui/")) continue;
  for (const { specifier, line } of imports(file)) {
    if (specifier.startsWith("next/") || specifier === "next") {
      fail(file, line, "packages/ui may not import next/*");
    }
    if (specifier.startsWith("@tauri-apps/")) {
      fail(file, line, "packages/ui may not import @tauri-apps/*");
    }
  }
}

// 4. The agent seam is host-agnostic; only .../agent/native may touch Tauri.
for (const file of groups.packages) {
  const path = relative(ROOT, file);
  if (!path.startsWith("packages/host/src/agent/")) continue;
  if (path.startsWith("packages/host/src/agent/native/")) continue;
  for (const { specifier, line } of imports(file)) {
    if (specifier.startsWith("@tauri-apps/")) {
      fail(file, line, "only packages/host/src/agent/native may import @tauri-apps/*");
    }
    if (specifier.startsWith("next/")) fail(file, line, "the agent seam may not import next/*");
  }
}

// 5. packages/tokens is CSS only.
for (const file of walk(join(ROOT, "packages/tokens"))) {
  fail(file, 1, "packages/tokens is CSS only; a script here is a design-system bug");
}

// 6. Banned filename stems. `utils` is allowed only for a `cn` module.
for (const file of [...groups.web, ...groups.mobile, ...groups.packages]) {
  const path = relative(ROOT, file);
  if (BANNED_STEMS.test(`/${path}`)) fail(file, 1, "banned filename stem (see AGENTS.md → Naming)");
  const source = readFileSync(file, "utf8");
  if (BANNED_UTILS.test(`/${path}`) && !/export (function cn|\{ cn \})/.test(source)) {
    fail(file, 1, "`utils` is reserved for the shadcn cn module");
  }
}

// 7. Package entry files are re-exports only.
for (const file of groups.packages) {
  if (!file.endsWith("/src/index.ts")) continue;
  const content = lines(file);
  if (content.length > 40) fail(file, 1, `package entry is ${content.length} lines; the cap is 40`);
  content.forEach((text, index) => {
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("}")) return;
    if (!/^(export|import type|import \{|import \*)/.test(trimmed)) {
      fail(file, index + 1, "a package entry is re-exports only");
    }
  });
}

// 8. Tests live beside their source, in tests/, or in e2e/.
for (const file of [...groups.web, ...groups.mobile, ...groups.packages]) {
  const path = relative(ROOT, file);
  if (!/\.test\.(ts|tsx)$/.test(path)) continue;
  const ok = /\/tests\//.test(path) || /\/e2e\//.test(path) || /\/src\//.test(path) || path.startsWith("apps/web/tests/");
  if (!ok) fail(file, 1, "a test lives beside its source, under tests/, or under e2e/");
}

if (problems.length > 0) {
  console.error("Boundary violations (see AGENTS.md → Imports and boundaries):\n");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log("ok  boundaries: imports, naming, entries and test layout");
