/**
 * Adminer/MariaDB dump reader.
 *
 * The dump is an 86 MB Adminer 5.4.1 export:
 *   - one `CREATE TABLE` block per table, followed by
 *   - one `INSERT INTO ... VALUES` header, then one parenthesised row per line,
 *     tab-separated, with MySQL backslash escapes inside single-quoted strings.
 *
 * Only the requested tables are materialised. Column types come from the DDL, so
 * values are converted once at read time: integers/decimals to numbers, timestamps
 * to unix seconds, calendar dates to `YYYY-MM-DD`, everything else to text.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const INTEGER_TYPES = new Set([
  "bigint",
  "int",
  "integer",
  "mediumint",
  "smallint",
  "tinyint"
]);
const DECIMAL_TYPES = new Set(["decimal", "numeric", "float", "double", "real"]);
const TIMESTAMP_TYPES = new Set(["timestamp", "datetime"]);
const DATE_TYPES = new Set(["date"]);
const TEXT_TYPES = new Set([
  "char",
  "varchar",
  "tinytext",
  "text",
  "mediumtext",
  "longtext",
  "enum",
  "set",
  "json",
  "blob",
  "tinyblob",
  "mediumblob",
  "longblob",
  "binary",
  "varbinary"
]);

const CREATE_RE = /^CREATE TABLE `([^`]+)` \(/;
const INSERT_RE = /^INSERT INTO `([^`]+)` \(([^)]*)\) VALUES/;
const COLUMN_RE = /^\s*`([^`]+)`\s+([A-Za-z]+)/;

function decodeEscape(char) {
  switch (char) {
    case "0":
      return "\u0000";
    case "b":
      return "\b";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    case "Z":
      return "\u001a";
    case "\\":
      return "\\";
    case "'":
      return "'";
    case '"':
      return '"';
    default:
      return char;
  }
}

function parseRow(raw, expectedColumns, lineNumber) {
  let text = raw.trim();
  if (text.endsWith(",") || text.endsWith(";")) text = text.slice(0, -1);
  if (!text.startsWith("(") || !text.endsWith(")")) {
    throw new Error(`Malformed row at line ${lineNumber}`);
  }
  text = text.slice(1, -1);

  const values = [];
  let current = "";
  let quoted = false;
  let inQuote = false;

  const push = () => {
    values.push({ text: current, quoted });
    current = "";
    quoted = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuote) {
      if (char === "\\") {
        current += decodeEscape(text[index + 1] ?? "");
        index += 1;
      } else if (char === "'") {
        if (text[index + 1] === "'") {
          current += "'";
          index += 1;
        } else {
          inQuote = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'") {
      inQuote = true;
      quoted = true;
    } else if (char === "\t") {
      push();
    } else if (char === "," && text[index + 1] === "\t") {
      // Adminer separates fields with `,\t` (comma immediately before a tab).
      // The tab owns the separator; skip the comma so it is not appended to the
      // previous field.
    } else {
      current += char;
    }
  }
  push();

  if (values.length !== expectedColumns.length) {
    throw new Error(
      `Row at line ${lineNumber} has ${values.length} fields, expected ${expectedColumns.length}`
    );
  }
  return values;
}

function parseTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (match === null) return null;
  const [, year, month, day, hour, minute, second] = match;
  if (Number(year) === 0 || Number(month) === 0 || Number(day) === 0) return null;
  return Math.floor(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ) / 1000
  );
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) return null;
  if (Number(match[1]) === 0 || Number(match[2]) === 0 || Number(match[3]) === 0) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function convertValue(field, type) {
  if (!field.quoted && (field.text === "NULL" || field.text === "\\N")) return null;
  if (type === undefined) {
    if (field.quoted) return field.text;
    const trimmed = field.text.trim();
    if (trimmed === "NULL") return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed) ? numeric : trimmed;
  }
  if (INTEGER_TYPES.has(type) || DECIMAL_TYPES.has(type)) {
    const trimmed = field.text.trim();
    if (trimmed.length === 0) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (TIMESTAMP_TYPES.has(type)) {
    const trimmed = field.text.trim();
    return trimmed.length === 0 ? null : parseTimestamp(trimmed);
  }
  if (DATE_TYPES.has(type)) {
    const trimmed = field.text.trim();
    return trimmed.length === 0 ? null : parseDate(trimmed);
  }
  if (TEXT_TYPES.has(type)) return field.text;
  return field.quoted ? field.text : field.text.trim();
}

/**
 * Reads the dump, returning only the requested tables.
 *
 * @param {string} path
 * @param {readonly string[]} tables
 * @returns {Promise<{ tables: Map<string, { columns: string[], types: Map<string, string>, rows: unknown[][] }> }>}
 */
export async function readDump(path, tables) {
  const wanted = new Set(tables);
  /** @type {Map<string, Map<string, string>>} */
  const types = new Map();
  /** @type {Map<string, { columns: string[], types: Map<string, string>, rows: unknown[][] }>} */
  const data = new Map();

  let createTable = null;
  let current = null;
  let lineNumber = 0;

  const reader = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const rawLine of reader) {
    lineNumber += 1;
    const line = rawLine.replace(/\r$/, "");

    const create = CREATE_RE.exec(line);
    if (create !== null) {
      createTable = wanted.has(create[1]) ? create[1] : null;
      if (createTable !== null && !types.has(createTable)) types.set(createTable, new Map());
      continue;
    }

    if (createTable !== null) {
      if (line.startsWith(")")) {
        createTable = null;
        continue;
      }
      const column = COLUMN_RE.exec(line);
      if (column !== null) {
        types.get(createTable).set(column[1], column[2].toLowerCase());
      }
      continue;
    }

    const insert = INSERT_RE.exec(line);
    if (insert !== null) {
      const table = insert[1];
      if (!wanted.has(table)) {
        current = null;
        continue;
      }
      const columns = insert[2]
        .split(",")
        .map((name) => name.trim().replace(/^`|`$/g, ""));
      const tableTypes = types.get(table) ?? new Map();
      types.set(table, tableTypes);
      const existing = data.get(table);
      if (existing !== undefined) {
        if (existing.columns.join(",") !== columns.join(",")) {
          throw new Error(`Column list changed between INSERT chunks for ${table}`);
        }
        current = existing;
      } else {
        current = {
          table,
          columns,
          types: tableTypes,
          rows: []
        };
        data.set(table, current);
      }
      continue;
    }

    if (current === null) continue;
    if (!line.startsWith("(")) {
      current = null;
      continue;
    }

    const fields = parseRow(line, current.columns, lineNumber);
    const row = fields.map((field, index) =>
      convertValue(field, current.types.get(current.columns[index]))
    );
    current.rows.push(row);
    if (line.endsWith(");")) current = null;
  }

  return { tables: data };
}

/** Convenience: a table as keyed rows with the declared column order. */
export function keyedRows(table) {
  if (table === undefined) return [];
  const { columns, rows } = table;
  return rows.map((row) => {
    const out = {};
    for (let index = 0; index < columns.length; index += 1) out[columns[index]] = row[index];
    return out;
  });
}
