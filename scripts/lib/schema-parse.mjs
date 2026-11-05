/**
 * Shared parsing primitives for the schema audit scripts.
 *
 * Every helper here is a pure function over text: no file-system access, no
 * writes. The callers own I/O and error reporting.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const CODE_EXTENSIONS = [".ts", ".svelte", ".js", ".mjs"];
export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".svelte-kit",
  "coverage",
  "build",
  "dist"
]);

/** Type aliases re-exported by db/schema.ts — not table exports. */
export const TYPE_ALIASES = new Set(["User", "Staff", "Student", "Parent", "Session"]);

/** Files that declare or re-export the schema — never usage sources. */
export const SCHEMA_LAYER = new Set([
  "src/lib/server/db/sms-schema.ts",
  "src/lib/server/db/schema.ts",
  "src/lib/server/db/sms-relations.ts"
]);

export const toPosix = (p) => p.split(sep).join("/");

/** Recursively list source files under `dir`, relative to `root`. */
export function walk(root, dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...walk(root, full));
    } else if (CODE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(toPosix(relative(root, full)));
    }
  }
  return out;
}

/**
 * Locate the paren balancing the one at `openIndex`, skipping string literals
 * and comments. Returns -1 when unbalanced.
 */
export function matchParen(source, openIndex) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i === -1) return source.length;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2);
      if (i === -1) return source.length;
      i += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

/** Parse every `export const X = mysqlTable("db_name", ...)` declaration. */
export function parseTables(source) {
  const tables = [];
  const declRe = /export const (\w+)\s*=\s*mysqlTable\(\s*(["'])([^"']+)\2/g;
  for (const match of source.matchAll(declRe)) {
    const openParen = source.indexOf("(", match.index);
    const closeParen = matchParen(source, openParen);
    if (closeParen === -1) throw new Error(`Unbalanced mysqlTable() for ${match[1]}`);
    tables.push({
      var: match[1],
      dbName: match[3],
      startLine: lineAt(source, match.index),
      endLine: lineAt(source, closeParen),
      bodyStart: openParen,
      bodyEnd: closeParen
    });
  }
  return tables.sort((a, b) => a.startLine - b.startLine);
}

export function isSchemaModule(specifier) {
  if (specifier.includes("app-db.schema")) return false;
  return /(?:^|\/)(?:sms-schema|db\/schema)$/.test(specifier);
}

/** Split an import brace list into original export names, resolving aliases. */
export function importNames(braceBody) {
  return braceBody
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^type\s+/, "").trim())
    .map((part) => part.split(/\s+as\s+/)[0].trim())
    .filter((name) => /^\w+$/.test(name) && name !== "type");
}

export const IMPORT_RE =
  /import\s+(type\s+)?(?:(\*\s+as\s+(\w+))|\{([^}]*)\})\s*from\s*(["'])([^"']+)\5/g;
export const DYNAMIC_RE =
  /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*(["'])([^"']+)\2\s*\)/g;

/**
 * Split a table body into column chunks. A chunk begins at the first-indent
 * `key:` line (tables in this file use either 2- or 4-space column indents) and
 * runs until the next one at the same indent. Deeper-indented lines belong to
 * nested option objects and are absorbed into the current chunk.
 */
export function columnChunks(body) {
  const lines = body.split("\n");
  let indent = null;
  for (const line of lines) {
    const m = /^(\s+)(\w+)\s*:/.exec(line);
    if (m) {
      indent = m[1];
      break;
    }
  }
  if (indent === null) return [];

  const startRe = new RegExp(`^${indent}(\\w+)\\s*:`);
  const chunks = [];
  let current = null;
  for (const line of lines) {
    const start = startRe.exec(line);
    if (start) {
      current = { key: start[1], text: line };
      chunks.push(current);
    } else if (current) {
      current.text += `\n${line}`;
    }
  }
  return chunks;
}

const COLUMN_BUILDERS =
  "int|integer|varchar|text|char|tinyint|smallint|mediumint|bigint|float|double|decimal|numeric|boolean|date|datetime|timestamp|time|year|json|blob|binary|varbinary|enum|longtext|mediumtext|tinytext";

/** Parse one column chunk into its declared shape. */
export function parseColumn(chunk) {
  const nameMatch = new RegExp(`\\b(?:${COLUMN_BUILDERS})\\(\\s*["']([^"']+)["']`).exec(chunk.text);
  const typeMatch = new RegExp(`\\b(${COLUMN_BUILDERS})\\b`).exec(chunk.text);
  return {
    key: chunk.key,
    column: nameMatch ? nameMatch[1] : chunk.key,
    type: typeMatch ? typeMatch[1] : "unknown"
  };
}

/** Extract every `.references(() => other.column, { ... })` in a chunk. */
export function parseReferences(text) {
  const refs = [];
  const re = /\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)\s*,\s*\{([^}]*)\}/g;
  for (const m of text.matchAll(re)) {
    const onDelete = /onDelete:\s*["']([^"']+)["']/.exec(m[3]);
    const onUpdate = /onUpdate:\s*["']([^"']+)["']/.exec(m[3]);
    refs.push({
      targetVar: m[1],
      targetColumn: m[2],
      onDelete: onDelete ? onDelete[1] : null,
      onUpdate: onUpdate ? onUpdate[1] : null
    });
  }
  return refs;
}

/** Composite `primaryKey({ columns: [table.a, table.b] })` declarations. */
export function parseCompositePrimaryKey(text) {
  const m = /primaryKey\(\{\s*columns:\s*\[([^\]]+)\]/g;
  const found = [];
  for (const match of text.matchAll(m)) {
    const cols = match[1]
      .split(",")
      .map((c) => c.trim())
      .map((c) => c.split(".").pop())
      .filter(Boolean);
    if (cols.length > 0) found.push(cols);
  }
  return found;
}

/**
 * Table-level `foreignKey({ columns: [...], foreignColumns: [...] })` extras,
 * with their chained `.onDelete(...)` / `.onUpdate(...)` modifiers.
 */
export function parseTableForeignKeys(text) {
  const found = [];
  // The trailing window is a lookahead so consecutive foreignKey() declarations
  // are not consumed by the previous match.
  const re = /foreignKey\(\s*\{([\s\S]*?)\}\s*\)(?=([\s\S]{0,200}))/g;
  for (const m of text.matchAll(re)) {
    const columns = /columns:\s*\[([^\]]+)\]/.exec(m[1]);
    const foreign = /foreignColumns:\s*\[([^\]]+)\]/.exec(m[1]);
    if (!columns || !foreign) continue;
    const own = columns[1].split(",").map((c) => c.trim().split(".").pop());
    const target = foreign[1].split(",").map((c) => c.trim());
    const onDelete = /\.onDelete\(\s*["']([^"']+)["']\s*\)/.exec(m[2]);
    const onUpdate = /\.onUpdate\(\s*["']([^"']+)["']\s*\)/.exec(m[2]);
    for (let i = 0; i < Math.min(own.length, target.length); i += 1) {
      const [targetVar, targetColumn] = target[i].split(".");
      if (!targetVar || !targetColumn) continue;
      found.push({
        column: own[i],
        targetVar,
        targetColumn,
        onDelete: onDelete ? onDelete[1] : null,
        onUpdate: onUpdate ? onUpdate[1] : null
      });
    }
  }
  return found;
}
