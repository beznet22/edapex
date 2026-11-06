#!/usr/bin/env node
/**
 * Static rule guard for the service-led HTTP layer.
 *
 * Route modules must validate through the wrappers, call services, and stay
 * within the route cap. Legacy URLs and `{ success }` wrappers are banned so
 * the service-led surface does not drift back into a verbatim port.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HTTP_SUFFIX = path.join("src", "lib", "server", "http");
const ROUTES_SUFFIX = path.join(HTTP_SUFFIX, "routes");
const LINE_CAP = 300;

const BANNED_REQUESTS = [
  { pattern: /c\.req\.json\s*\(/g, message: "reads the JSON body directly" },
  { pattern: /c\.req\.parseBody\s*\(/g, message: "parses the body directly" },
  { pattern: /c\.req\.header\s*\(/g, message: "reads a header directly" },
  { pattern: /c\.req\.cookie\s*\(/g, message: "reads a cookie directly" },
  { pattern: /c\.env\.DB\b/g, message: "accesses the D1 binding directly" }
];

const BANNED_PATHS = [
  "/api/commit",
  "/api/uploads",
  "/api/mentions/search",
  "/api/class-roster/toggle-status",
  "/api/photos/claim",
  "/api/settings/academic-calendar",
  "/api/parents/connect-telegram",
  "/api/results/generate-pdf",
  "/api/demo",
  "/r/"
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

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function readIfExists(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function scan(rootDir) {
  const routesDir = path.join(rootDir, ROUTES_SUFFIX);
  const files = listTypeScriptFiles(routesDir);
  const violations = [];
  const mountText = [
    readIfExists(path.join(rootDir, HTTP_SUFFIX, "routes", "index.ts")),
    readIfExists(path.join(rootDir, HTTP_SUFFIX, "app.ts"))
  ].join("\n");

  for (const file of files) {
    if (path.basename(file) === "index.ts") continue;
    const source = readFileSync(file, "utf8");
    const relative = path.relative(rootDir, file);
    const lineCount = source.split("\n").length;
    if (lineCount > LINE_CAP) {
      violations.push({
        file: relative,
        line: LINE_CAP + 1,
        message: `file has ${lineCount} lines, cap is ${LINE_CAP}`
      });
    }

    for (const rule of BANNED_REQUESTS) {
      for (const match of source.matchAll(rule.pattern)) {
        violations.push({
          file: relative,
          line: lineAt(source, match.index ?? 0),
          message: rule.message
        });
      }
    }

    for (const banned of BANNED_PATHS) {
      const index = source.indexOf(banned);
      if (index >= 0) {
        violations.push({
          file: relative,
          line: lineAt(source, index),
          message: `contains legacy path ${banned}`
        });
      }
    }

    if (/c\.json\(\s*\{\s*success\b/.test(source)) {
      violations.push({
        file: relative,
        line: 1,
        message: "returns a { success } wrapper"
      });
    }

    const basename = path.basename(file, ".ts");
    if (!mountText.includes(basename)) {
      violations.push({
        file: relative,
        line: 1,
        message: "route module is not mounted"
      });
    }
  }

  const appSource = readIfExists(path.join(rootDir, HTTP_SUFFIX, "app.ts"));
  if (!/export type AppType\b/.test(appSource)) {
    violations.push({
      file: path.join("src", "lib", "server", "http", "app.ts"),
      line: 1,
      message: "AppType is not exported"
    });
  }

  return { files: files.length, violations };
}

function selfTest() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "edapex-http-"));
  try {
    const httpDir = path.join(tempRoot, HTTP_SUFFIX);
    const routesDir = path.join(httpDir, "routes");
    mkdirSync(routesDir, { recursive: true });
    writeFileSync(path.join(httpDir, "app.ts"), "export type AppType = unknown;\n");
    writeFileSync(path.join(routesDir, "index.ts"), 'import "./good.routes";\n');
    writeFileSync(path.join(routesDir, "good.routes.ts"), "export const good = 1;\n");

    const clean = scan(tempRoot);
    if (clean.violations.length !== 0) {
      throw new Error(
        `self-test false positive: ${clean.violations.map((entry) => entry.message).join(", ")}`
      );
    }

    writeFileSync(
      path.join(routesDir, "bad.routes.ts"),
      [
        "const body = c.req.json();",
        "const database = c.env.DB;",
        'const legacy = "/api/demo/admit";',
        "export const bad = body;",
        ...Array.from({ length: 301 }, () => "export const x = 1;")
      ].join("\n")
    );
    const bad = scan(tempRoot);
    const messages = bad.violations.map((entry) => entry.message).join(" | ");
    for (const expected of [
      "reads the JSON body directly",
      "accesses the D1 binding directly",
      "contains legacy path /api/demo",
      "file has"
    ]) {
      if (!messages.includes(expected)) {
        throw new Error(`self-test missed: ${expected}`);
      }
    }

    writeFileSync(path.join(routesDir, "unmounted.routes.ts"), "export const u = 1;\n");
    const unmounted = scan(tempRoot);
    if (
      !unmounted.violations.some(
        (entry) => entry.message === "route module is not mounted"
      )
    ) {
      throw new Error("self-test missed the unmounted route");
    }

    console.log("http rule self-test passed: seeded violations detected");
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
      console.error(`${violation.file}:${violation.line} ${violation.message}`);
    }
    console.error(`http check failed: ${result.violations.length} violation(s)`);
    process.exit(1);
  }
  console.log(`http check passed: ${result.files} route module(s) inspected`);
}
