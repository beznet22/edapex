import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  ALL_TABLES,
  LEGACY_INDEXES,
  LEGACY_INDEX_TOTAL,
  LEGACY_TABLES,
  NEW_TABLE_INDEXES,
  NEW_TABLES,
  RECOVERED_INDEX_TOTAL,
  REDESIGN_EXTRA_INDEXES,
  SPEC_EXTRA_TOTAL
} from "../fixtures/schema-expectations";
import type { IndexExpectation } from "../fixtures/schema-expectations";

const SYSTEM_TABLES = ["d1_migrations"];

interface ColumnRow {
  readonly tbl: string;
  readonly col: string;
}

interface IndexRow {
  readonly tbl: string;
  readonly idx: string;
  readonly uniq: number;
  readonly col: string;
  readonly seqno: number;
}

interface IndexFacts {
  readonly unique: boolean;
  readonly columns: readonly string[];
}

const readTables = async (): Promise<readonly string[]> => {
  const result = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all<{ name: string }>();
  return result.results
    .map((row) => row.name)
    .filter((name) => !SYSTEM_TABLES.includes(name));
};

const readColumns = async (): Promise<ReadonlyMap<string, number>> => {
  const result = await env.DB.prepare(
    "SELECT m.name AS tbl, p.name AS col FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'"
  ).all<ColumnRow>();
  const counts = new Map<string, number>();
  for (const row of result.results) {
    if (SYSTEM_TABLES.includes(row.tbl)) continue;
    counts.set(row.tbl, (counts.get(row.tbl) ?? 0) + 1);
  }
  return counts;
};

const readIndexes = async (): Promise<ReadonlyMap<string, IndexFacts>> => {
  const result = await env.DB.prepare(
    "SELECT m.name AS tbl, il.name AS idx, il.\"unique\" AS uniq, ii.name AS col, ii.seqno AS seqno FROM sqlite_master m JOIN pragma_index_list(m.name) il JOIN pragma_index_info(il.name) ii WHERE m.type = 'table' AND il.name NOT LIKE 'sqlite_autoindex_%' ORDER BY il.name, ii.seqno"
  ).all<IndexRow>();
  const columns = new Map<string, string[]>();
  const meta = new Map<string, { tbl: string; unique: boolean }>();
  for (const row of result.results) {
    if (SYSTEM_TABLES.includes(row.tbl)) continue;
    const list = columns.get(row.idx) ?? [];
    list[row.seqno] = row.col;
    columns.set(row.idx, list);
    meta.set(row.idx, { tbl: row.tbl, unique: row.uniq === 1 });
  }
  const indexes = new Map<string, IndexFacts>();
  for (const [name, entry] of meta) {
    indexes.set(name, { unique: entry.unique, columns: columns.get(name) ?? [] });
  }
  return indexes;
};

const expectIndexes = (
  table: string,
  expected: readonly IndexExpectation[],
  actual: ReadonlyMap<string, IndexFacts>,
  failures: string[]
): void => {
  for (const index of expected) {
    const facts = actual.get(index.name);
    if (facts === undefined) {
      failures.push(`${table}: missing index ${index.name}`);
      continue;
    }
    if (facts.unique !== index.unique) {
      failures.push(`${table}: ${index.name} unique=${facts.unique}, expected ${index.unique}`);
    }
    if (facts.columns.join("|") !== index.columns.join("|")) {
      failures.push(
        `${table}: ${index.name} columns=${facts.columns.join("|")}, expected ${index.columns.join("|")}`
      );
    }
  }
};

describe("D1 schema gate", () => {
  it("creates exactly the 62 legacy tables plus the 15 registered tables", async () => {
    const tables = await readTables();
    expect([...tables].sort()).toEqual([...ALL_TABLES].sort());
    expect(LEGACY_TABLES).toHaveLength(62);
    expect(NEW_TABLES).toHaveLength(15);
  });

  it("keeps every table at or below the 100-column D1 cap", async () => {
    const counts = await readColumns();
    const overCap = [...counts].filter(([, columns]) => columns > 100);
    expect(overCap).toEqual([]);
    expect(counts.size).toBe(ALL_TABLES.length);
  });

  it("declares the 226 recovered indexes with the inventory's names and column order", async () => {
    const indexes = await readIndexes();
    const failures: string[] = [];
    let recovered = 0;
    let legacySecondary = 0;

    for (const table of LEGACY_TABLES) {
      const recoveredForTable = LEGACY_INDEXES[table] ?? [];
      const extras = REDESIGN_EXTRA_INDEXES.filter((entry) => entry.table === table);
      expectIndexes(table, recoveredForTable, indexes, failures);
      expectIndexes(table, extras, indexes, failures);
      recovered += recoveredForTable.length;
      legacySecondary += recoveredForTable.length + extras.length;
    }

    expect(failures).toEqual([]);
    expect(recovered).toBe(RECOVERED_INDEX_TOTAL);
    expect(extrasDeclared()).toBe(SPEC_EXTRA_TOTAL);
    expect(legacySecondary).toBe(LEGACY_INDEX_TOTAL);
  });

  it("declares the new-table indexes", async () => {
    const indexes = await readIndexes();
    const failures: string[] = [];
    for (const table of NEW_TABLES) {
      expectIndexes(table, NEW_TABLE_INDEXES[table] ?? [], indexes, failures);
    }
    expect(failures).toEqual([]);
  });

  it("counts the recovered indexes against the live database", async () => {
    const indexes = await readIndexes();
    const legacyNames = new Set(
      LEGACY_TABLES.flatMap((table) => (LEGACY_INDEXES[table] ?? []).map((index) => index.name))
    );
    const recoverable = [...indexes.keys()].filter((name) => legacyNames.has(name));
    expect(recoverable).toHaveLength(RECOVERED_INDEX_TOTAL);
    expect(indexes.size).toBe(LEGACY_INDEX_TOTAL + NEW_TABLE_INDEXES_TOTAL);
  });

  it("returns zero rows from PRAGMA foreign_key_check", async () => {
    const result = await env.DB.prepare("PRAGMA foreign_key_check").all();
    expect(result.results).toEqual([]);
  });

  it("lists only the expected named secondary indexes and no name collisions", async () => {
    const indexes = await readIndexes();
    const names = [...indexes.keys()];
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(LEGACY_INDEX_TOTAL + NEW_TABLE_INDEXES_TOTAL);
  });
});

const extrasDeclared = (): number =>
  new Set(REDESIGN_EXTRA_INDEXES.map((index) => index.name)).size;

const NEW_TABLE_INDEXES_TOTAL = Object.values(NEW_TABLE_INDEXES).reduce(
  (total, list) => total + list.length,
  0
);
