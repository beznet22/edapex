import { sql } from "drizzle-orm";
import { check, integer, text } from "drizzle-orm/sqlite-core";
import type {
  CheckBuilder,
  SQLiteColumn,
  SQLiteIntegerBuilderInitial,
  SQLiteTextBuilderInitial
} from "drizzle-orm/sqlite-core";

/** One date encoding, schema-wide: calendar days are ISO-8601 `YYYY-MM-DD` text. */
export const calendarDate = <TName extends string>(
  name: TName
): SQLiteTextBuilderInitial<TName, [string, ...string[]], undefined> => text(name);

/** One date encoding, schema-wide: instants are integer unix seconds (UTC). */
export const unixSeconds = <TName extends string>(name: TName): SQLiteIntegerBuilderInitial<TName> =>
  integer(name);

/** SQLite has no boolean type; `05 §4` fixes 0/1 integers. */
export const boolean01 = <TName extends string>(
  name: TName,
  defaultValue: 0 | 1 = 0
): SQLiteIntegerBuilderInitial<TName> => integer(name).notNull().default(defaultValue);

/** Money is stored in integer minor units; floating point never holds currency. */
export const moneyMinorUnits = <TName extends string>(name: TName): SQLiteIntegerBuilderInitial<TName> =>
  integer(name);

/** `05 §4` requires enums as TEXT with a CHECK constraint, not a lookup table. */
export const statusCheck = (
  name: string,
  column: SQLiteColumn,
  values: readonly string[]
): CheckBuilder => check(name, sql`${column} in (${sql.raw(sqlStringList(values))})`);

/** Audit columns shared by every legacy table that carried them. */
export const auditTimestamps = (): {
  createdAt: SQLiteIntegerBuilderInitial<"created_at">;
  updatedAt: SQLiteIntegerBuilderInitial<"updated_at">;
} => ({
  createdAt: integer("created_at"),
  updatedAt: integer("updated_at")
});

const sqlStringList = (values: readonly string[]): string =>
  values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
