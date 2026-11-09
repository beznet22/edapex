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
