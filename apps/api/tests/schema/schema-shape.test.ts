import { SQLiteColumn, getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { allTables } from "../../src/lib/server/db/schema";
import {
  ALL_TABLES,
  LEGACY_INDEXES,
  NEW_TABLE_INDEXES,
  REDESIGN_EXTRA_INDEXES
} from "../fixtures/schema-expectations";
import type { IndexExpectation } from "../fixtures/schema-expectations";

const DECLARED_TABLE_COUNT = 74;

interface DeclaredIndex {
  readonly name: string;
  readonly unique: boolean;
  readonly columns: readonly string[];
}

const describeIndex = (index: DeclaredIndex): string =>
  `${index.name}:${index.unique ? "unique" : "index"}:${index.columns.join("|")}`;

const expectedIndexes = (tableName: string): readonly IndexExpectation[] => {
  const legacy = LEGACY_INDEXES[tableName];
  if (legacy !== undefined) {
    return [...legacy, ...REDESIGN_EXTRA_INDEXES.filter((entry) => entry.table === tableName)];
  }
  return NEW_TABLE_INDEXES[tableName] ?? [];
};

const declaredIndexes = (table: (typeof allTables)[number]): readonly DeclaredIndex[] =>
  getTableConfig(table).indexes.map((declared) => ({
    name: declared.config.name ?? "",
    unique: declared.config.unique,
    columns: declared.config.columns.map((column) =>
      column instanceof SQLiteColumn ? column.name : "<expression>"
    )
  }));

const tableName = (table: (typeof allTables)[number]): string => getTableConfig(table).name;

describe("declared Drizzle schema", () => {
  it("declares the expected number of tables so far", () => {
    expect(allTables).toHaveLength(DECLARED_TABLE_COUNT);
  });

  it("only declares tables registered in the port inventory", () => {
    const registered = new Set<string>(ALL_TABLES);
    const unknown = allTables.map(tableName).filter((name) => !registered.has(name));
    expect(unknown).toEqual([]);
  });

  it("declares exactly the registry: 62 legacy tables plus 12 new tables", () => {
    const declared = allTables.map(tableName).sort();
    const expected = [...ALL_TABLES].sort();
    expect(declared).toEqual(expected);
  });

  it("declares no duplicate table names", () => {
    const names = allTables.map(tableName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps every table within the 100-column D1 cap", () => {
    const overCap = allTables
      .map((table) => ({ name: tableName(table), columns: getTableConfig(table).columns.length }))
      .filter((entry) => entry.columns > 100);
    expect(overCap).toEqual([]);
  });

  it("declares the recovered and spec-mandated indexes, in order", () => {
    const mismatches = allTables.flatMap((table) => {
      const name = tableName(table);
      const declared = declaredIndexes(table).map(describeIndex).sort();
      const expected = expectedIndexes(name).map(describeIndex).sort();
      return declared.join("\n") === expected.join("\n") ? [] : [{ name, declared, expected }];
    });
    expect(mismatches).toEqual([]);
  });

  it("uses integer unix seconds for every *_at column", () => {
    const wrongType = allTables.flatMap((table) =>
      getTableConfig(table)
        .columns.filter((column) => column.name.endsWith("_at") && column.dataType !== "number")
        .map((column) => `${tableName(table)}.${column.name}:${column.dataType}`)
    );
    expect(wrongType).toEqual([]);
  });

  it("uses ISO text for every calendar-date column", () => {
    const wrongType = allTables.flatMap((table) =>
      getTableConfig(table)
        .columns.filter(
          (column) =>
            (column.name.endsWith("_date") ||
              column.name.endsWith("_on") ||
              column.name === "starts_on" ||
              column.name === "ends_on") &&
            column.dataType !== "string"
        )
        .map((column) => `${tableName(table)}.${column.name}:${column.dataType}`)
    );
    expect(wrongType).toEqual([]);
  });

  it("declares no unnamed unique constraint that SQLite would turn into an autoindex", () => {
    const unnamed = allTables.flatMap((table) =>
      getTableConfig(table)
        .uniqueConstraints.map((constraint) => `${tableName(table)}:${constraint.name ?? "<unnamed>"}`)
    );
    expect(unnamed).toEqual([]);
  });
});
