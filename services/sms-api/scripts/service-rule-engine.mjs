/**
 * Pure service-layer rule engine. Used by `check-service-rules.mjs` (filesystem
 * scan) and by `tests/services/boundary.test.ts` (no filesystem).
 */

const SERVICE_CAP = 400;
const DOMAIN_CAP = 200;

const IMPORT_RE = /import\s+(type\s+)?[^;]*?\s+from\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const ANY_RE = /(:\s*any\b|<\s*any\s*>|\bas\s+any\b)/;
const CAST_RE = /\bas\s+(?!const\b|type\b)[A-Za-z_$]/;
const MODULE_MAP_RE = /^(?:export\s+)?(?:const|let|var)\b.*\bnew\s+(?:Map|Set)\b/;

const BANNED_MODULES = [
  "node:fs",
  "node:crypto",
  "node:path",
  "node:os",
  "fs",
  "crypto",
  "marksheet-ast-parser",
  "mdast-util",
  "micromark"
];

const folderOf = (relative) => relative.split("/")[0] ?? "";

const lineAt = (source, index) => source.slice(0, index).split("\n").length;

function importSpecifiers(source) {
  const specifiers = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    specifiers.push({
      specifier: match[2],
      typeOnly: match[1] !== undefined,
      index: match.index ?? 0
    });
  }
  for (const match of source.matchAll(DYNAMIC_IMPORT_RE)) {
    specifiers.push({
      specifier: match[1],
      typeOnly: false,
      index: match.index ?? 0
    });
  }
  return specifiers;
}

export function validateSource(relative, source) {
  const violations = [];
  const add = (message, line = 1) => violations.push({ file: relative, line, message });
  const folder = folderOf(relative);
  const isServiceFile = relative.endsWith(".service.ts");
  const isDomain = folder === "domain";
  const isPort = folder === "ports";
  const isAdapter = folder === "adapters";
  const isContext = folder === "context";

  const lineCount = source.split("\n").length;
  const cap = isDomain ? DOMAIN_CAP : SERVICE_CAP;
  if (lineCount > cap) add(`file has ${lineCount} lines, cap is ${cap}`);

  for (const match of source.matchAll(/\bdb\.transaction\s*\(/g)) {
    add("uses db.transaction(); use batchOrThrow", lineAt(source, match.index ?? 0));
  }

  for (const [index, line] of source.split("\n").entries()) {
    if (/^\s*import\b/.test(line)) continue;
    if (ANY_RE.test(line)) add("uses `any`", index + 1);
    if (CAST_RE.test(line)) add("uses an `as` type cast", index + 1);
    if (MODULE_MAP_RE.test(line)) add("declares a module-scope Map/Set", index + 1);
    if (!isContext && /\b(?:ctx|repos\.ctx)\.db\b/.test(line)) {
      add("uses the repository db handle directly", index + 1);
    }
  }

  for (const { specifier, typeOnly, index } of importSpecifiers(source)) {
    const line = lineAt(source, index);
    const parserModule =
      specifier.includes("marksheet-ast-parser") ||
      specifier.includes("mdast-util") ||
      specifier.includes("micromark");
    const bannedNonRelative =
      !specifier.startsWith(".") && BANNED_MODULES.includes(specifier);
    if (bannedNonRelative || parserModule) {
      add(`imports banned module "${specifier}"`, line);
    }
    if (specifier.includes("$lib") || specifier.includes("../src")) {
      add(`imports outside the API tree: "${specifier}"`, line);
    }
    if (specifier.includes("getDatabase")) {
      add("imports getDatabase", line);
    }
    if (specifier.includes("/repository") || specifier.startsWith("../../repository")) {
      if (!isContext) add(`imports the repository layer: "${specifier}"`, line);
    }
    if (specifier.includes("/services") || specifier.startsWith("../services")) {
      if (!isContext) add(`imports the service layer: "${specifier}"`, line);
    }
    if (isServiceFile && specifier.endsWith(".service")) {
      add(`imports another service class: "${specifier}"`, line);
    }
    if (isAdapter && (specifier.includes("/repository") || specifier.includes("/services"))) {
      add(`adapter imports a repository or service: "${specifier}"`, line);
    }
    if (isDomain && !typeOnly && specifier.startsWith("../")) {
      if (!specifier.includes("constants/")) {
        add(`domain imports runtime code from outside its folder: "${specifier}"`, line);
      }
    }
    if (isPort && specifier.startsWith("../")) {
      add(`port imports outside the ports folder: "${specifier}"`, line);
    }
    if (isDomain && /^\.\.?\//.test(specifier) === false && !typeOnly) {
      add(`domain imports a non-relative runtime module: "${specifier}"`, line);
    }
  }

  if (isDomain) {
    for (const match of source.matchAll(/\bDate\.now\s*\(|\bnew\s+Date\s*\(/g)) {
      add("domain reads the system clock directly", lineAt(source, match.index ?? 0));
    }
  }

  return violations;
}

export const SERVICE_RULE_CAPS = { SERVICE_CAP, DOMAIN_CAP };
