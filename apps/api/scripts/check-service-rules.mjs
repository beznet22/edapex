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

const REQUIRED_TREE = [
  "context/service-context.ts",
  "context/create-service-context.ts",
  "context/create-service.ts",
  "context/logger.ts",
  "context/index.ts",
  "ports/email-sender.port.ts",
  "ports/google-oauth.port.ts",
  "ports/auth-config.port.ts",
  "ports/ocr-client.port.ts",
  "ports/report-settings-store.port.ts",
  "ports/clock.port.ts",
  "ports/student-directory.port.ts",
  "ports/index.ts",
  "adapters/cloudflare-email.adapter.ts",
  "adapters/env-auth-config.adapter.ts",
  "adapters/google-oauth.adapter.ts",
  "adapters/mistral-ocr.adapter.ts",
  "adapters/d1-report-settings.adapter.ts",
  "adapters/index.ts",
  "domain/marks.ts",
  "domain/marks-types.ts",
  "domain/grades.ts",
  "domain/student-matcher.ts",
  "domain/marksheet-validation.ts",
  "domain/index.ts",
  "assessment/entry.service.ts",
  "assessment/query.service.ts",
  "assessment/roster-query.service.ts",
  "assessment/feedback.service.ts",
  "assessment/ocr.service.ts",
  "assessment/publish.service.ts",
  "assessment/capture.service.ts",
  "assessment/index.ts",
  "attendance/attendance.service.ts",
  "attendance/index.ts",
  "settings/general.service.ts",
  "settings/academic.service.ts",
  "settings/report.service.ts",
  "settings/index.ts",
  "auth/auth.service.ts",
  "auth/auth-events.ts",
  "auth/claim-link.ts",
  "auth/claim-policy.ts",
  "auth/claim.service.ts",
  "auth/code-normalisation.ts",
  "auth/google.service.ts",
  "auth/session-issuance.ts",
  "auth/signed-payload.ts",
  "auth/session.service.ts",
  "auth/rate-limit.service.ts",
  "auth/profile.service.ts",
  "auth/index.ts",
  "authorization/authorization.service.ts",
  "authorization/index.ts",
  "students/student-lifecycle.service.ts",
  "students/index.ts",
  "index.ts"
];

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

function requireTree() {
  const servicesDir = path.join(ROOT, SERVICES_SUFFIX);
  const missing = REQUIRED_TREE.filter(
    (relative) => !existsSync(path.join(servicesDir, relative))
  );
  if (missing.length > 0) {
    console.error("service tree is incomplete:");
    for (const relative of missing) console.error(`  missing ${relative}`);
    process.exit(1);
  }
  console.log(`service tree passed: ${REQUIRED_TREE.length} required file(s) present`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  requireTree();
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
