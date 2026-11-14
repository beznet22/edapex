#!/usr/bin/env node
/**
 * Proves the 01b migration map is accounted for: every legacy method is either
 * implemented at a named target or explicitly retired. Run after any
 * repository change; the PR gate requires a zero exit.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { EXTRA_IMPLEMENTED, IMPLEMENTED, RETIRED } from "./repository-method-map.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAP_PATH = path.resolve(ROOT, "..", "..", "docs", "cloudflare-port", "01b-repository-migration-map.md");
const REPOSITORY_DIR = path.join(ROOT, "src", "lib", "server", "repository");

if (!existsSync(MAP_PATH)) {
  console.error(`cannot read 01b at ${MAP_PATH}`);
  process.exit(1);
}

const lines = readFileSync(MAP_PATH, "utf8").split("\n");
const methods = [];
for (const line of lines) {
  const match = line.match(/^\|\s*`([a-zA-Z0-9_]+)`\s*\|\s*\d+\s*\|/);
  if (match) methods.push(match[1]);
}

const uniqueMethods = [...new Set(methods)];
const failures = [];

if (methods.length !== 108) {
  failures.push(`01b parsed ${methods.length} method rows, expected 108`);
}

const normalizeTargets = (target) =>
  Array.isArray(target[0]) ? target : [target];

const checkTarget = (legacy, target) => {
  const [relative, exported] = target;
  const file = path.join(REPOSITORY_DIR, relative);
  if (!existsSync(file)) {
    failures.push(`${legacy}: target file ${relative} does not exist`);
    return;
  }
  const source = readFileSync(file, "utf8");
  const present =
    source.includes(`function ${exported}(`) ||
    source.includes(`const ${exported} =`) ||
    source.includes(`export { ${exported} }`);
  if (!present) {
    failures.push(`${legacy}: ${relative} does not export ${exported}`);
  }
};

for (const legacy of uniqueMethods) {
  if (legacy in RETIRED) continue;
  const target = IMPLEMENTED[legacy];
  if (target === undefined) {
    failures.push(`${legacy}: no target in repository-method-map.mjs`);
    continue;
  }
  for (const single of normalizeTargets(target)) checkTarget(legacy, single);
}

for (const [legacy, target] of Object.entries(EXTRA_IMPLEMENTED)) {
  if (uniqueMethods.includes(legacy)) {
    failures.push(`${legacy}: listed as extra but already covered by 01b`);
    continue;
  }
  checkTarget(legacy, target);
}

const retiredCount = uniqueMethods.filter((method) => method in RETIRED).length;
const implementedCount = uniqueMethods.length - retiredCount;

if (failures.length > 0) {
  for (const failure of failures) console.error(`repository map: ${failure}`);
  process.exit(1);
}

console.log(
  `repository map passed: ${methods.length} 01b method rows ` +
    `(${implementedCount} implemented, ${retiredCount} retired; ${uniqueMethods.length} unique names) ` +
    `+ ${Object.keys(EXTRA_IMPLEMENTED).length} non-async legacy methods`
);
