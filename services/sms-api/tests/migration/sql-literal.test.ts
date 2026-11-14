import { describe, expect, it } from "vitest";

import {
  chunk,
  insertStatement,
  insertStatements,
  sqlIdentifier,
  sqlLiteral
} from "../../scripts/migration/sql-literal.mjs";

describe("migration SQL literals", () => {
  it("encodes null, numbers and booleans", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(undefined)).toBe("NULL");
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(1.5)).toBe("1.5");
    expect(sqlLiteral(Number.NaN)).toBe("NULL");
    expect(sqlLiteral(true)).toBe("1");
    expect(sqlLiteral(false)).toBe("0");
  });

  it("doubles quotes, drops NUL and preserves unicode", () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral("line\nbreak\ttab")).toBe("'line\nbreak\ttab'");
    expect(sqlLiteral("a\u0000b")).toBe("'ab'");
    expect(sqlLiteral("Lighthouse — Makurdi ₦")).toBe("'Lighthouse — Makurdi ₦'");
  });

  it("serialises JSON values", () => {
    expect(sqlLiteral({ a: 1, b: "x" })).toBe(`'{"a":1,"b":"x"}'`);
  });

  it("rejects unsafe identifiers", () => {
    expect(sqlIdentifier("sm_students")).toBe(`"sm_students"`);
    expect(() => sqlIdentifier("students; drop table users")).toThrow();
  });

  it("builds a multi-row insert in column order", () => {
    const statement = insertStatement("t", ["a", "b"], [
      { a: 1, b: "x" },
      { a: 2, b: null }
    ]);
    expect(statement).toBe(
      `INSERT OR REPLACE INTO "t" ("a", "b") VALUES\n(1, 'x'),\n(2, NULL);`
    );
    expect(insertStatement("t", ["a"], [])).toBeNull();
  });

  it("splits rows into deterministic statements", () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ id: index + 1 }));
    expect(chunk(rows, 2)).toHaveLength(3);
    const statements = insertStatements("t", ["id"], rows, 2);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain("(1)");
    expect(statements[2]).toContain("(5)");
  });
});
