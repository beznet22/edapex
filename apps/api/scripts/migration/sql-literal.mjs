/**
 * SQLite literal encoding for the offline migration writer.
 *
 * No bound parameters: these files are executed by `wrangler d1 execute --file`.
 * Single quotes are doubled, NUL is dropped (SQLite text literals cannot carry it),
 * and every other byte is written verbatim as UTF-8.
 */

const NUL = "\u0000";

export function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") {
    return `'${value.split(NUL).join("").replaceAll("'", "''")}'`;
  }
  if (Array.isArray(value) || typeof value === "object") {
    return sqlLiteral(JSON.stringify(value));
  }
  throw new TypeError(`Unsupported SQL literal type: ${typeof value}`);
}

export function sqlIdentifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export function chunk(items, size) {
  if (!Number.isInteger(size) || size < 1) throw new Error("chunk size must be a positive integer");
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/**
 * Encodes one multi-row INSERT. `columns` fixes the order; every row must have
 * exactly those keys. Returns null for an empty row set.
 */
export function insertStatement(table, columns, rows) {
  if (rows.length === 0) return null;
  const names = columns.map(sqlIdentifier).join(", ");
  const values = rows
    .map((row) => `(${columns.map((column) => sqlLiteral(row[column])).join(", ")})`)
    .join(",\n");
  return `INSERT OR REPLACE INTO ${sqlIdentifier(table)} (${names}) VALUES\n${values};`;
}

export function insertStatements(table, columns, rows, rowsPerStatement = 20) {
  return chunk(rows, rowsPerStatement)
    .map((group) => insertStatement(table, columns, group))
    .filter((statement) => statement !== null);
}
