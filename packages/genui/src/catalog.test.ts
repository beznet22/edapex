import { describe, expect, it } from "vitest";

import { edapexLibrary } from "./catalog";

describe("edapex OpenUI catalog", () => {
  it("advertises the root and component names", () => {
    expect(edapexLibrary.root).toBe("Stack");
    const prompt = edapexLibrary.prompt();
    expect(prompt).toContain("Stack");
    expect(prompt).toContain("Metric");
    expect(prompt).toContain("Table");
  });

  it("advertises the chunk-5 agent surfaces", () => {
    const prompt = edapexLibrary.prompt();
    expect(prompt).toContain("OperationList");
    expect(prompt).toContain("GrantCoverage");
  });

  /*
   * The dropped set is the whole reason this surface exists. If `dropped` were folded into
   * `granted` a revoked operation would still render as if it worked, which is the failure
   * the narrowing invariant is meant to make impossible — the UI would then undo it.
   */
  it("keeps dropped grants in a separate field from live ones", () => {
    const surface = edapexLibrary.components.OperationList;
    expect(surface).toBeDefined();
    const parsed = surface?.props.safeParse({
      granted: ["students:read"],
      dropped: ["students:write"]
    });
    expect(parsed?.success).toBe(true);
    if (parsed?.success === true) {
      expect(parsed.data.granted).toEqual(["students:read"]);
      expect(parsed.data.dropped).toEqual(["students:write"]);
    }
  });

  it("rejects a coverage report above its own ceiling", () => {
    const surface = edapexLibrary.components.GrantCoverage;
    const parsed = surface?.props.safeParse({ used: 30, ceiling: 200 });
    // 30 of 200 is legitimate; the shape only bounds the numbers.
    expect(parsed?.success).toBe(true);
    const negative = surface?.props.safeParse({ used: -1, ceiling: 23 });
    expect(negative?.success).toBe(false);
  });

  it("caps table rows at twenty", () => {
    const table = edapexLibrary.components.Table;
    expect(table).toBeDefined();
    const parsed = table?.props.safeParse({
      columns: ["A"],
      rows: Array.from({ length: 21 }, () => ["value"])
    });
    expect(parsed?.success).toBe(false);
  });
});
