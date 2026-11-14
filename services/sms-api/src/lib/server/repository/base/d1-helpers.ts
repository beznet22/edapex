import { getTableColumns, inArray } from "drizzle-orm";
import type { InferInsertModel, SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import type { RepositoryDb } from "./repository-context";

/** D1 allows 100 bound parameters per statement (`01a §1`). */
export const MAX_BINDS = 100;

/** 95 ids leave room for up to five fixed predicates in the same statement. */
export const IN_CHUNK = 95;

/**
 * D1 has no hard statement-count limit inside a batch, but the whole batch is
 * one transaction bounded by the 30 s query budget and the Worker's memory.
 * 100 is the project guard: a flow that needs more statements is redesigned,
 * never silently chunked across batches (which would break atomicity).
 */
export const MAX_BATCH_STATEMENTS = 100;

export type BindValue = string | number | bigint;

/**
 * Splits an id list into `IN (...)` predicates of at most `IN_CHUNK` values.
 * Empty input returns no predicates; callers must not emit `IN ()`.
 */
export function chunkedInArray<TValue extends BindValue>(
  column: SQLiteColumn,
  ids: readonly TValue[]
): SQL<unknown>[] {
  if (ids.length === 0) return [];
  const predicates: SQL<unknown>[] = [];
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    predicates.push(inArray(column, ids.slice(index, index + IN_CHUNK)));
  }
  return predicates;
}

/**
 * Builds insert statements whose bind count stays within the D1 limit. The
 * caller owns `db.batch()`; this helper never executes anything.
 */
export function chunkedInsert<TTable extends SQLiteTable>(
  db: RepositoryDb,
  table: TTable,
  rows: readonly InferInsertModel<TTable>[],
  paramsPerRow: number
): BatchItem<"sqlite">[] {
  if (rows.length === 0) return [];
  const rowsPerStatement = rowsPerInsert(table, paramsPerRow);
  const statements: BatchItem<"sqlite">[] = [];
  for (let index = 0; index < rows.length; index += rowsPerStatement) {
    const chunk = rows.slice(index, index + rowsPerStatement);
    statements.push(db.insert(table).values([...chunk]));
  }
  return statements;
}

/**
 * Same bind math as `chunkedInsert`, but conflicts are ignored so restore is
 * idempotent. Nullable-key unique indexes still treat NULLs as distinct.
 */
export function chunkedInsertIgnore<TTable extends SQLiteTable>(
  db: RepositoryDb,
  table: TTable,
  rows: readonly InferInsertModel<TTable>[],
  paramsPerRow: number
): BatchItem<"sqlite">[] {
  if (rows.length === 0) return [];
  const rowsPerStatement = rowsPerInsert(table, paramsPerRow);
  const statements: BatchItem<"sqlite">[] = [];
  for (let index = 0; index < rows.length; index += rowsPerStatement) {
    const chunk = rows.slice(index, index + rowsPerStatement);
    statements.push(db.insert(table).values([...chunk]).onConflictDoNothing());
  }
  return statements;
}

function rowsPerInsert<TTable extends SQLiteTable>(
  table: TTable,
  paramsPerRow: number
): number {
  if (!Number.isInteger(paramsPerRow) || paramsPerRow < 1) {
    throw new RangeError("paramsPerRow must be a positive integer");
  }
  if (paramsPerRow > MAX_BINDS) {
    throw new RangeError(
      `paramsPerRow (${paramsPerRow}) exceeds the D1 bind limit of ${MAX_BINDS}`
    );
  }

  // Drizzle emits every table column for a multi-row insert, including columns
  // the caller omitted. The real bind count per row is therefore the column
  // count, and `paramsPerRow` can only raise it, never lower it.
  const columnCount = Object.keys(getTableColumns(table)).length;
  const effectiveParamsPerRow = Math.max(paramsPerRow, columnCount);
  if (effectiveParamsPerRow > MAX_BINDS) {
    throw new RangeError(
      `table needs ${effectiveParamsPerRow} binds per row, above the D1 limit of ${MAX_BINDS}`
    );
  }

  return Math.max(1, Math.floor(MAX_BINDS / effectiveParamsPerRow));
}

/**
 * Executes a non-empty batch atomically. Results are intentionally discarded:
 * repository callers act on committed state, and a batch cannot read a
 * generated id mid-flight (`01 §8`).
 */
export async function batchOrThrow(
  db: RepositoryDb,
  statements: readonly BatchItem<"sqlite">[]
): Promise<void> {
  if (statements.length === 0) {
    throw new RangeError("batchOrThrow requires at least one statement");
  }
  if (statements.length > MAX_BATCH_STATEMENTS) {
    throw new RangeError(
      `batch contains ${statements.length} statements, above the guard of ${MAX_BATCH_STATEMENTS}`
    );
  }
  const [first, ...rest] = statements;
  if (first === undefined) {
    throw new RangeError("batchOrThrow requires at least one statement");
  }
  await db.batch([first, ...rest]);
}
