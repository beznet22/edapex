#!/usr/bin/env node
/**
 * Repository-layer rule guard.
 *
 * Enforces the mechanically checkable rules from `01 §4` and the phase brief:
 *   R1  a repository imports only its aggregate's tables (plus read-only reference)
 *   R4  no `any`, no `as` casts, explicit files only
 *   R6  no `db.transaction(`
 *   R7  every repository file is at most 300 lines
 *   R8  every module is exported from its folder barrel and the root barrel
 *   R9  no repository imports another repository or a `queries/` module
 *
 * Run with `--self-test` to prove the checker fails on seeded violations.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AGGREGATES, REFERENCE_READ } from "./repository-contract.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPOSITORY_SUFFIX = path.join("src", "lib", "server", "repository");
const LINE_CAP = 300;
const IMPORT_RE = /import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
const SCHEMA_IMPORT_RE = /import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']*db\/schema[^"']*)["']/g;
const WRITE_RE = /\.(insert|update|delete)\(\s*([A-Za-z_$][\w$]*)/g;

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function relativePath(rootDir, file) {
  return path.relative(path.join(rootDir, REPOSITORY_SUFFIX), file).split(path.sep).join("/");
}

function aggregateOf(relative) {
  const parts = relative.split("/");
  if (parts[0] === "profiles") return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

function importedIdentifiers(clause) {
  const match = clause.match(/\{([\s\S]*)\}/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith("type "))
    .map((part) => part.split(/\s+as\s+/)[0].trim())
    .filter((part) => part.length > 0);
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function scan(rootDir) {
  const repositoryDir = path.join(rootDir, REPOSITORY_SUFFIX);
  const files = listFiles(repositoryDir);
  const violations = [];
  const add = (file, message, line = 1) => violations.push({ file, line, message });

  for (const file of files) {
    const relative = relativePath(rootDir, file);
    const source = readFileSync(file, "utf8");
    const cleaned = stripComments(source);
    const lines = source.split("\n");
    const folder = aggregateOf(relative);
    const fileName = path.basename(relative);

    if (lines.length > LINE_CAP) {
      add(relative, `file has ${lines.length} lines, cap is ${LINE_CAP}`);
    }

    for (const match of cleaned.matchAll(/\bdb\.transaction\s*\(/g)) {
      add(relative, "uses db.transaction(); use batchOrThrow", lineAt(cleaned, match.index ?? 0));
    }

    for (const match of cleaned.matchAll(/(:\s*any\b|<\s*any\s*>|\bas\s+any\b)/g)) {
      add(relative, "uses `any`", lineAt(cleaned, match.index ?? 0));
    }

    for (const [index, line] of cleaned.split("\n").entries()) {
      if (/^\s*(import|export)\b/.test(line)) continue;
      if (/\bas\s+(?!const\b|type\b)[A-Za-z_$]/.test(line)) {
        add(relative, "uses an `as` type cast", index + 1);
      }
    }

    for (const match of cleaned.matchAll(IMPORT_RE)) {
      const specifier = match[2];
      const clause = match[1];
      if (/^[a-z@]/i.test(specifier) && !specifier.startsWith("drizzle-orm")) {
        add(relative, `imports non-platform module "${specifier}"`);
      }
      if (specifier.startsWith("$lib") || specifier.startsWith("@/") || specifier.includes("../src")) {
        add(relative, `imports outside the repository tree: "${specifier}"`);
      }
      if (!specifier.startsWith(".")) continue;
      if (specifier.includes("db/schema")) continue;

      const resolved = path.resolve(path.dirname(file), specifier);
      const target = path.relative(repositoryDir, resolved).split(path.sep).join("/");
      if (target.startsWith("..")) {
        add(relative, `relative import escapes the repository tree: "${specifier}"`);
        continue;
      }
      const targetFolder = aggregateOf(target);
      const isRepoModule = /\.repo$/.test(specifier);
      if (isRepoModule && fileName !== "index.ts") {
        add(relative, `imports another repository module: "${specifier}"`);
      }
      if (targetFolder === "base" || target.startsWith("base/")) continue;
      if (specifier.includes("db/schema")) continue;
      if (targetFolder === "queries" && folder !== "queries") {
        add(relative, `repository imports a query module: "${specifier}"`);
      } else if (targetFolder !== folder) {
        add(relative, `cross-aggregate import: "${specifier}"`);
      }
    }

    if (folder === "queries") {
      for (const match of cleaned.matchAll(WRITE_RE)) {
        add(relative, "query modules are read-only", lineAt(cleaned, match.index ?? 0));
      }
    }

    const ownTables = AGGREGATES[folder];
    for (const match of cleaned.matchAll(SCHEMA_IMPORT_RE)) {
      const identifiers = importedIdentifiers(match[1]);
      const writable = new Set(ownTables ?? []);
      for (const identifier of identifiers) {
        const isKnown = Object.values(AGGREGATES).some(
          (tables) => tables !== null && tables.includes(identifier)
        );
        if (!isKnown) {
          add(relative, `imports unknown schema table "${identifier}"`);
          continue;
        }
        if (folder === "queries") continue;
        if (!writable.has(identifier) && !REFERENCE_READ.includes(identifier)) {
          add(relative, `imports table "${identifier}" outside its aggregate`);
        }
      }
    }

    if (folder !== "queries") {
      const ownTables = new Set(AGGREGATES[folder] ?? []);
      for (const match of cleaned.matchAll(WRITE_RE)) {
        const identifier = match[2];
        if (REFERENCE_READ.includes(identifier) && !ownTables.has(identifier)) {
          add(
            relative,
            `writes read-only reference table "${identifier}"`,
            lineAt(cleaned, match.index ?? 0)
          );
        }
      }
    }
  }

  // Barrel completeness (R8): every directory exports each sibling module.
  const directories = new Set(files.map((file) => path.dirname(file)));
  for (const directory of directories) {
    const indexPath = path.join(directory, "index.ts");
    const relativeDirectory = relativePath(rootDir, directory);
    if (!existsSync(indexPath)) {
      add(`${relativeDirectory}/`, "missing folder barrel index.ts");
      continue;
    }
    const indexSource = readFileSync(indexPath, "utf8");
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name === "index.ts") continue;
      const stem = entry.name.slice(0, -3);
      if (!indexSource.includes(`"./${stem}"`)) {
        add(`${relativeDirectory}/index.ts`, `does not export "./${stem}"`);
      }
    }
  }

  const rootIndex = path.join(repositoryDir, "index.ts");
  if (existsSync(rootIndex) && existsSync(repositoryDir)) {
    const rootSource = readFileSync(rootIndex, "utf8");
    for (const entry of readdirSync(repositoryDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!rootSource.includes(`"./${entry.name}"`)) {
        add("index.ts", `root barrel does not export "./${entry.name}"`);
      }
    }
  }

  return { files: files.length, violations };
}

function selfTest() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "edapex-repository-"));
  const repositoryDir = path.join(tempRoot, REPOSITORY_SUFFIX);
  const accountsDir = path.join(repositoryDir, "accounts");
  try {
    mkdirSync(accountsDir, { recursive: true });
    writeFileSync(
      path.join(accountsDir, "index.ts"),
      'export * from "./demo.repo";\nexport * from "./long.repo";\n'
    );
    writeFileSync(path.join(repositoryDir, "index.ts"), 'export * from "./accounts";\n');
    writeFileSync(
      path.join(accountsDir, "demo.repo.ts"),
      [
        'import { smClasses, smRoutes } from "../../db/schema";',
        'import { other } from "./other.repo";',
        "export async function demo(db: Demo): Promise<void> {",
        "  const value = 1 as number;",
        "  await db.transaction(async () => other);",
        "  const broken: any = smRoutes;",
        "  await db.update(smClasses).set({});",
        "}",
        ""
      ].join("\n")
    );
    writeFileSync(
      path.join(accountsDir, "long.repo.ts"),
      `${Array.from({ length: 301 }, (_, index) => `const line${index} = ${index};`).join("\n")}\n`
    );
    const bad = scan(tempRoot);
    const messages = bad.violations.map((violation) => violation.message).join(" | ");
    const expected = [
      "db.transaction()",
      "`any`",
      "`as` type cast",
      "outside its aggregate",
      "another repository module",
      "writes read-only reference table",
      "lines, cap is"
    ];
    for (const fragment of expected) {
      if (!messages.includes(fragment)) {
        throw new Error(`self-test: did not detect "${fragment}" (got: ${messages})`);
      }
    }

    writeFileSync(
      path.join(accountsDir, "demo.repo.ts"),
      'import { users } from "../../db/schema";\nexport const demo = users;\n'
    );
    writeFileSync(path.join(accountsDir, "long.repo.ts"), "export const long = 1;\n");
    const clean = scan(tempRoot);
    if (clean.violations.length !== 0) {
      throw new Error(`self-test: clean tree produced ${clean.violations.length} violation(s)`);
    }
    console.log("repository self-test passed: seeded violations detected, clean tree accepted");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const result = scan(ROOT);
  for (const violation of result.violations) {
    console.error(`${violation.file}:${violation.line} ${violation.message}`);
  }
  if (result.violations.length > 0) {
    console.error(`repository check failed: ${result.violations.length} violation(s)`);
    process.exit(1);
  }
  console.log(`repository check passed: ${result.files} file(s) inspected`);
}
