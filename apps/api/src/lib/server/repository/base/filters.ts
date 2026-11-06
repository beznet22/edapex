import { and, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/** Combines only the supplied predicates; returns `undefined` when none exist. */
export function optionalFilters(
  conditions: readonly (SQL<unknown> | undefined)[]
): SQL<unknown> | undefined {
  const supplied = conditions.filter(
    (condition): condition is SQL<unknown> => condition !== undefined
  );
  return supplied.length > 0 ? and(...supplied) : undefined;
}

/** Adds an equality predicate only when the value is not `null`/`undefined`. */
export function eqIfPresent(
  column: SQLiteColumn,
  value: string | number | bigint | null | undefined
): SQL<unknown> | undefined {
  return value === null || value === undefined ? undefined : eq(column, value);
}
