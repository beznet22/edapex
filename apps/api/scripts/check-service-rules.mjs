#!/usr/bin/env node
/**
 * Static rule guard for `src/lib/server/services/**`.
 *
 * Enforces the mechanically checkable parts of `02 §2` and §3:
 * no repository/db/service imports in services (context is the composition
 * root), no fs/node:crypto, no markdown linter imports, no `any`/`as` casts,
 * no module-scope Map/Set, no direct db handle, line caps.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { validateSource } from "./service-rule-engine.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SERVICES_SUFFIX = path.join("src", "lib", "server", "services");

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

function scan() {
  const servicesDir = path.join(ROOT, SERVICES_SUFFIX);
  const files = listTypeScriptFiles(servicesDir);
  const violations = [];

  for (const file of files) {
    const relative = path.relative(servicesDir, file).split(path.sep).join("/");
    const source = readFileSync(file, "utf8");
    violations.push(...validateSource(relative, source));
  }

  return { files: files.length, violations };
}

function selfTest() {
  const fixtures = [
    {
      name: "node crypto",
      file: "assessment/x.service.ts",
      source: 'import crypto from "node:crypto";\nexport const x = 1;\n'
    },
    {
      name: "module Map",
      file: "assessment/x.service.ts",
      source: "export const cache = new Map<string, number>();\n"
    },
    {
      name: "any",
      file: "assessment/x.service.ts",
      source: "export const x: any = 1;\n"
    },
    {
      name: "cast",
      file: "assessment/x.service.ts",
      source: "export const x = value as Foo;\n"
    },
    {
      name: "service import",
      file: "assessment/entry.service.ts",
      source: 'import { GeneralService } from "../settings/general.service";\n'
    },
    {
      name: "adapter repository import",
      file: "adapters/x.adapter.ts",
      source: 'import { findReportSettings } from "../../repository/school";\n'
    },
    {
      name: "domain runtime import",
      file: "domain/marks.ts",
      source: 'import { z } from "zod";\n'
    },
    {
      name: "linter import",
      file: "assessment/x.service.ts",
      source: 'import { parse } from "$lib/utils/marksheet-ast-parser";\n'
    },
    {
      name: "direct db handle",
      file: "assessment/x.service.ts",
      source: "export const rows = ctx.db.select();\n"
    },
    {
      name: "line cap",
      file: "assessment/long.service.ts",
      source: `${"export const x = 1;\n".repeat(401)}`
    }
  ];

  let failed = false;
  for (const fixture of fixtures) {
    const violations = validateSource(fixture.file, fixture.source);
    if (violations.length === 0) {
      console.error(`self-test missed: ${fixture.name}`);
      failed = true;
    }
  }

  const clean = validateSource(
    "domain/marks.ts",
    "export const add = (a: number, b: number): number => a + b;\n"
  );
  if (clean.length !== 0) {
    console.error(`self-test false positive: ${clean.map((entry) => entry.message).join(", ")}`);
    failed = true;
  }

  if (failed) {
    console.error("service rule self-test failed");
    process.exit(1);
  }
  console.log(`service rule self-test passed: ${fixtures.length} seeded violations detected`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const { files, violations } = scan();
  if (violations.length > 0) {
    console.error("service rule check failed:");
    for (const violation of violations) {
      console.error(`  ${violation.file}:${violation.line} ${violation.message}`);
    }
    process.exit(1);
  }
  console.log(`service rule check passed: ${files} file(s) inspected`);
}
