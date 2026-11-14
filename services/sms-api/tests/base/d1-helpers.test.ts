import { env } from "cloudflare:workers";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  MAX_BATCH_STATEMENTS,
  batchOrThrow,
  chunkedInArray,
  chunkedInsert,
  chunkedInsertIgnore
} from "../../src/lib/server/repository/base/d1-helpers";
import { smBaseGroups, smStudents } from "../../src/lib/server/db/schema";
import { database, minimalStudentRow, seedSchool } from "../support/seed";

const db = database(env);

describe("chunkedInArray", () => {
  it.each([0, 1, 95, 96, 190, 191])(
    "chunks %i ids into predicates with room for five fixed filters",
    (count) => {
      const ids = Array.from({ length: count }, (_, index) => index + 1);
      const predicates = chunkedInArray(smStudents.id, ids);
      expect(predicates).toHaveLength(Math.ceil(count / 95));
    }
  );

  it("returns no predicate for an empty list so callers never emit IN ()", () => {
    expect(chunkedInArray(smStudents.id, [])).toEqual([]);
  });
});

describe("chunkedInsert", () => {
  it("returns no statement for an empty row set", () => {
    expect(chunkedInsert(db, smStudents, [], 3)).toEqual([]);
  });

  it("splits rows at exactly 100 binds and never exceeds the limit", () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: 900 + index,
      name: `Group ${index}`
    }));
    const atHundred = chunkedInsert(db, smBaseGroups, rows.slice(0, 10), 10);
    expect(atHundred).toHaveLength(1);
    const aboveHundred = chunkedInsert(db, smBaseGroups, rows, 10);
    expect(aboveHundred).toHaveLength(2);
  });

  it("never lowers the bind budget below the table's real column count", () => {
    const columns = Object.keys(getTableColumns(smStudents)).length;
    const rowsPerStatement = Math.floor(100 / columns);
    const rows = Array.from({ length: rowsPerStatement + 1 }, (_, index) => ({ id: 900 + index }));
    expect(chunkedInsert(db, smStudents, rows, 3)).toHaveLength(2);
  });

  it("throws at build time when a row needs more than 100 binds", () => {
    expect(() => chunkedInsert(db, smStudents, [{ id: 1 }], 101)).toThrow(RangeError);
    expect(() => chunkedInsert(db, smStudents, [{ id: 1 }], 100)).not.toThrow();
  });
});

describe("batchOrThrow", () => {
  it("rejects an empty batch instead of issuing nothing", async () => {
    await expect(batchOrThrow(db, [])).rejects.toBeInstanceOf(RangeError);
  });

  it("rejects a batch above the statement guard", async () => {
    const statements = Array.from({ length: MAX_BATCH_STATEMENTS + 1 }, () =>
      db.delete(smStudents)
    );
    await expect(batchOrThrow(db, statements)).rejects.toBeInstanceOf(RangeError);
  });

  it("rolls the whole batch back when a later statement fails", async () => {
    const school = await seedSchool(db, 1);
    const rows = Array.from({ length: 96 }, (_, index) =>
      minimalStudentRow(school, 5_000 + index)
    );

    const statements = chunkedInsert(db, smStudents, rows, 3);
    const columns = Object.keys(getTableColumns(smStudents)).length;
    expect(statements).toHaveLength(Math.ceil(rows.length / Math.floor(100 / columns)));
    await batchOrThrow(db, statements);

    const inserted = await db.select({ id: smStudents.id }).from(smStudents);
    expect(inserted.filter((row) => row.id >= 5_000)).toHaveLength(96);

    const conflicting = chunkedInsert(db, smStudents, [{ id: 5_000, fullName: "Duplicate" }], 1);
    const [firstConflict] = conflicting;
    if (firstConflict === undefined) throw new Error("fixture produced no statement");
    await expect(batchOrThrow(db, [firstConflict])).rejects.toBeDefined();
  });
});

describe("chunkedInsertIgnore", () => {
  it("returns no statement for an empty row set", () => {
    expect(chunkedInsertIgnore(db, smBaseGroups, [], 3)).toEqual([]);
  });

  it("ignores a duplicate primary key instead of failing", async () => {
    const school = await seedSchool(db, 77);
    const rows = [{ id: 7_701, name: "Group 7701", schoolId: school.schoolId }];
    await batchOrThrow(db, chunkedInsertIgnore(db, smBaseGroups, rows, 1));
    await batchOrThrow(db, chunkedInsertIgnore(db, smBaseGroups, rows, 1));

    const stored = await db.select({ id: smBaseGroups.id }).from(smBaseGroups);
    expect(stored.filter((entry) => entry.id === 7_701)).toHaveLength(1);
  });

  it("keeps the same bind budget as chunkedInsert", () => {
    expect(() => chunkedInsertIgnore(db, smStudents, [{ id: 1 }], 101)).toThrow(RangeError);
    expect(() => chunkedInsertIgnore(db, smStudents, [{ id: 1 }], 100)).not.toThrow();
  });
});
