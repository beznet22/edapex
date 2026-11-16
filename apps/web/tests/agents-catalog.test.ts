import { describe, expect, it } from "vitest";

import { buildCapabilityManifest } from "@edapex/contracts";

import { grantCatalog, grantCatalogWith } from "@/lib/agents-api";

/**
 * The grant picker must never offer what the server would reject.
 *
 * Offering an option that fails on save is worse than not offering it: the person only
 * finds out after writing the whole draft. So these tests compare the picker against
 * the ceiling function the server uses.
 */

describe("grant catalog", () => {
  it("offers exactly the operations the role can perform", () => {
    const catalog = grantCatalog(buildCapabilityManifest("teacher"));
    const offered = new Set(catalog.tools.flatMap((tool) => tool.operations.map((o) => o.operationId)));

    // `apply` and `decide` are admin-only operations.
    expect(offered.has("apply")).toBe(false);
    expect(offered.has("decide")).toBe(false);
    // `save_marksheet` is a teacher operation.
    expect(offered.has("save_marksheet")).toBe(true);
  });

  it("never lists the same operation twice", () => {
    // `get` is reachable through several tools. A checkbox appearing twice reads as two
    // separate permissions when it is one.
    const catalog = grantCatalog(buildCapabilityManifest("teacher"));
    const ids = catalog.tools.flatMap((tool) => tool.operations.map((o) => o.operationId));
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("drops tools that have no reachable operation", () => {
    const catalog = grantCatalog(buildCapabilityManifest("student"));
    expect(catalog.tools.every((tool) => tool.operations.length > 0)).toBe(true);
  });

  it("gives a student fewer operations than a parent", () => {
    // Parents can browse class structure; students cannot. If this flips, the picker
    // is offering a student something the server will reject.
    const student = grantCatalog(buildCapabilityManifest("student"));
    const parent = grantCatalog(buildCapabilityManifest("parent"));
    expect(parent.byId.size).toBeGreaterThan(student.byId.size);
  });

  it("indexes every offered operation in byId", () => {
    const catalog = grantCatalog(buildCapabilityManifest("admin"));
    for (const tool of catalog.tools) {
      for (const operation of tool.operations) {
        expect(catalog.byId.get(operation.operationId)).toBeDefined();
      }
    }
  });

  it("scopes a picker to a foreign role", () => {
    // An admin editing a teacher's agent must see the teacher's ceiling, because that
    // is what the server validates against.
    const adminView = grantCatalogWith("admin");
    const teacherView = grantCatalogWith("teacher");
    expect(adminView.byId.has("apply")).toBe(true);
    expect(teacherView.byId.has("apply")).toBe(false);
  });
});
