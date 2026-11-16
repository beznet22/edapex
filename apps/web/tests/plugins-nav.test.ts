import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../../../packages/connectors/src/catalogue";
import { PLUGINS } from "@/lib/plugins-catalogue";
import { activeItemId, contextForPath, treeForPath, WORKSPACE_TREE } from "@/lib/nav-tree";

/**
 * The client plugin catalogue is a presentation copy of the server's connector
 * catalogue.
 *
 * It has to be a copy: `packages/connectors` is server-only and the dependency-boundary
 * test fails the build if it reaches a bundle. But a copy with no guard drifts, and the
 * failure mode is quiet — the UI offers a plugin the server cannot connect.
 */
describe("plugin catalogue mirrors the server connectors", () => {
  it("offers exactly the same ids", () => {
    const server = CATALOGUE.map((entry) => entry.id).sort();
    const client = PLUGINS.map((entry) => entry.id).sort();
    expect(client).toEqual(server);
  });

  it("uses the same display names", () => {
    for (const entry of CATALOGUE) {
      const mirror = PLUGINS.find((plugin) => plugin.id === entry.id);
      expect(mirror, `client catalogue is missing ${entry.id}`).toBeDefined();
      expect(mirror?.name).toBe(entry.name);
    }
  });

  it("asks for the same permissions", () => {
    // A summary that diverges is cosmetic; a permission list that diverges is consent
    // obtained under a false description.
    for (const entry of CATALOGUE) {
      const mirror = PLUGINS.find((plugin) => plugin.id === entry.id);
      expect(mirror?.requests).toEqual(entry.requests);
    }
  });
});

describe("navigation trees", () => {
  it("selects the settings tree for nested settings routes", () => {
    expect(contextForPath("/workspace/settings")).toBe("settings");
    expect(contextForPath("/workspace/settings/appearance")).toBe("settings");
    expect(contextForPath("/workspace/settings/")).toBe("settings");
  });

  it("keeps the workspace tree everywhere else", () => {
    expect(contextForPath("/workspace")).toBe("workspace");
    expect(contextForPath("/workspace/plugins")).toBe("workspace");
    expect(contextForPath("/workspace/make")).toBe("workspace");
  });

  it("matches the longest href so a parent does not light up with its child", () => {
    // `/workspace/settings` and `/workspace/settings/appearance` are both in the tree;
    // the child must win on the child route.
    const tree = treeForPath("/workspace/settings/appearance");
    expect(activeItemId(tree, "/workspace/settings/appearance")).toBe("appearance");
    expect(activeItemId(tree, "/workspace/settings")).toBe("profile");
  });

  it("returns null when nothing matches", () => {
    expect(activeItemId(WORKSPACE_TREE, "/workspace/unknown")).toBeNull();
  });

  it("points every workspace item at a real route", () => {
    // A nav entry with a typo'd href renders a link to a 404 and is indistinguishable
    // from a broken feature.
    const hrefs = WORKSPACE_TREE.groups.flatMap((group) =>
      group.items.map((item) => item.href)
    );
    expect(hrefs.every((href) => href !== null && href.startsWith("/workspace"))).toBe(true);
  });
});
