#!/usr/bin/env node
/**
 * Static import-boundary guard for HTTP route handlers.
 *
 * Route modules may not import the repository or database layers. Runs on the
 * real tree by default; `--self-test` builds a temporary fixture and proves the
 * checker fails on a seeded violation and passes on a clean tree.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ROUTES_SUFFIX = path.join("src", "lib", "server", "http", "routes");
const FORBIDDEN = ["lib/server/repository/", "lib/server/db/"];

const STATIC_IMPORT_RE = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

function listTypeScriptFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listTypeScriptFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function resolveSpecifier(file, specifier) {
  if (specifier.startsWith(".")) return path.resolve(path.dirname(file), specifier);
  if (specifier.startsWith("@/")) return path.join(ROOT, "src", specifier.slice(2));
  if (specifier.startsWith("$lib/")) return path.join(ROOT, "src", "lib", specifier.slice(5));
  return null;
}

function scan(rootDir) {
  const routesDir = path.join(rootDir, ROUTES_SUFFIX);
  const violations = [];
  const files = listTypeScriptFiles(routesDir);

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const patterns = [STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE];

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (specifier === undefined) continue;
        const resolved = resolveSpecifier(file, specifier);
        if (resolved === null) continue;
        const normalized = resolved.split(path.sep).join("/");
        if (FORBIDDEN.some((boundary) => normalized.includes(boundary))) {
          violations.push({
            file: path.relative(rootDir, file),
            line: lineAt(source, match.index ?? 0),
            specifier
          });
        }
      }
    }
  }

  return { files: files.length, violations };
}

function selfTest() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "edapex-boundary-"));
  const routesDir = path.join(tempRoot, ROUTES_SUFFIX);
  const repositoryDir = path.join(tempRoot, "src", "lib", "server", "repository");

  try {
    mkdirSync(routesDir, { recursive: true });
    mkdirSync(repositoryDir, { recursive: true });
    writeFileSync(path.join(repositoryDir, "demo.ts"), "export const demo = 1;\n");

    writeFileSync(
      path.join(routesDir, "bad.routes.ts"),
      'import { demo } from "../../repository/demo";\nexport const value = demo;\n'
    );
    const bad = scan(tempRoot);
    if (bad.violations.length === 0) {
      throw new Error("self-test: seeded repository import was not detected");
    }

    writeFileSync(path.join(routesDir, "bad.routes.ts"), 'import { Hono } from "hono";\nexport const value = Hono;\n');
    const good = scan(tempRoot);
    if (good.violations.length !== 0) {
      throw new Error("self-test: clean tree produced violations");
    }

    console.log("boundary self-test passed: seeded violation detected, clean tree accepted");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const result = scan(ROOT);
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      console.error(`${violation.file}:${violation.line} imports ${violation.specifier}`);
    }
    console.error(`boundary check failed: ${result.violations.length} violation(s)`);
    process.exit(1);
  }
  console.log(`boundary check passed: ${result.files} route module(s) inspected`);
}
