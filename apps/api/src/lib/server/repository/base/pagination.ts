/** Keyset pagination contract (`01 §9.3`, `01a O10`). No `OFFSET` anywhere. */

export interface Page<T> {
  readonly rows: readonly T[];
  readonly nextCursor: string | null;
}

export interface PageQuery {
  readonly limit: number;
  readonly cursor?: string;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/** Clamps at the helper, never at the call site. */
export function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_LIMIT;
  const integer = Math.floor(limit);
  if (integer < 1) return 1;
  return Math.min(integer, MAX_PAGE_LIMIT);
}

/** Cursors are opaque strings carrying the last seen integer id. */
export function encodeCursor(id: number): string {
  return `id:${id}`;
}

export function decodeCursor(cursor: string | undefined): number | null {
  if (cursor === undefined) return null;
  if (!cursor.startsWith("id:")) return null;
  const value = Number(cursor.slice(3));
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

/** Builds the page and derives the next cursor from the last returned row. */
export function toPage<TRow>(
  rows: readonly TRow[],
  limit: number,
  idOf: (row: TRow) => number
): Page<TRow> {
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  const hasMore = rows.length > pageRows.length;
  return {
    rows: pageRows,
    nextCursor: hasMore && last !== undefined ? encodeCursor(idOf(last)) : null
  };
}
