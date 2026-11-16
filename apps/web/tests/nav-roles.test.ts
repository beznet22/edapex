import { describe, expect, it } from "vitest";

import { activeItemId, filterTreeForRole, treeForPath } from "@/lib/nav-tree";

/**
 * Role-gated navigation.
 *
 * The tree is filtered *before* rendering rather than the items hiding themselves. An item
 * that renders and then 403s teaches the person that the app is broken; one that was never
 * offered teaches them it is not for them.
 */
const idsFor = (role: "admin" | "teacher" | "parent" | "student" | null): readonly string[] =>
  filterTreeForRole(treeForPath("/workspace"), role).groups.flatMap((group) =>
    group.items.map((item) => item.id)
  );

describe("role-gated nav tree", () => {
  it("shows People to admins and teachers", () => {
    expect(idsFor("admin")).toContain("admin");
    expect(idsFor("teacher")).toContain("admin");
  });

  it("hides People from parents and students", () => {
    expect(idsFor("parent")).not.toContain("admin");
    expect(idsFor("student")).not.toContain("admin");
  });

  /*
   * `manifest` is null while capabilities load. Until the role is known no role-gated item
   * may appear — the safe direction is hiding, not guessing.
   */
  it("hides role-gated items while the role is unknown", () => {
    expect(idsFor(null)).not.toContain("admin");
  });

  it("keeps the ungated destinations for every role", () => {
    for (const role of ["admin", "teacher", "parent", "student"] as const) {
      expect(idsFor(role)).toEqual(expect.arrayContaining(["chat", "tasks", "make", "plugins"]));
    }
  });

  it("drops a group that empties out entirely", () => {
    const teacherTree = filterTreeForRole(treeForPath("/workspace"), "teacher");
    // Every remaining group must have at least one item; an empty group would render a bare
    // label above nothing.
    expect(teacherTree.groups.every((group) => group.items.length > 0)).toBe(true);
  });

  it("lights up People on the admin route", () => {
    const tree = filterTreeForRole(treeForPath("/workspace"), "admin");
    expect(activeItemId(tree, "/workspace/admin")).toBe("admin");
  });

  it("does not light up People on an unrelated workspace route", () => {
    const tree = filterTreeForRole(treeForPath("/workspace"), "admin");
    expect(activeItemId(tree, "/workspace/unknown")).toBeNull();
  });
});
