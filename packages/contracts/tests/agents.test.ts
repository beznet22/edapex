import { describe, expect, it } from "vitest";

import { effectiveGrant, droppedGrant, proposeAgent, agentInstructions } from "../src/agents";
import { packageFeatures, validatePackage } from "../src/tenant";
import schoolPackage from "../../../config/tenants/edapex-school/package.json";
import genericPackage from "../../../config/tenants/generic/package.json";

/**
 * The narrowing invariant and the tenant packages.
 *
 * The acceptance criterion for chunk 5 is that "an agent's grants never exceed the
 * creator's ceiling". That is a property of these two functions, so it is asserted
 * directly rather than inferred from a route.
 */

const draft = (operations: string[]) => ({
  name: "Assessment helper",
  purpose: "Prepares marksheets",
  model: "openrouter/auto",
  operationIds: operations
});

describe("proposeAgent", () => {
  it("accepts operations within the ceiling", () => {
    const result = proposeAgent({
      draft: draft(["search", "get"]),
      kind: "local",
      creatorRole: "admin",
      features: [],
      creatorIsAdmin: true
    });
    expect(result.kind).toBe("proposable");
    if (result.kind === "proposable") expect(result.within).toEqual(["search", "get"]);
  });

  it("reports an escalation instead of silently trimming it", () => {
    // A person told "these two were dropped" can fix their intent. A silent trim
    // leaves them believing they granted four.
    const result = proposeAgent({
      draft: draft(["get", "delete_everything"]),
      kind: "local",
      creatorRole: "teacher",
      features: [],
      creatorIsAdmin: false
    });
    expect(result.kind).toBe("proposable");
    if (result.kind === "proposable") {
      expect(result.within).toContain("get");
      expect(result.exceeding).toContain("delete_everything");
    }
  });

  it("refuses an operation only admin holds", () => {
    // The canonical escalation: a parent grants `update`, which no parent may hold.
    const parentCeiling = proposeAgent({
      draft: draft(["update"]),
      kind: "local",
      creatorRole: "parent",
      features: [],
      creatorIsAdmin: false
    });
    expect(parentCeiling.kind).toBe("rejected");
  });

  it("requires admin for a remote agent", () => {
    const result = proposeAgent({
      draft: draft(["get"]),
      kind: "remote",
      creatorRole: "teacher",
      features: [],
      creatorIsAdmin: false
    });
    expect(result).toEqual({ kind: "rejected", reason: "remote_requires_admin" });
  });

  it("rejects an empty operation set", () => {
    expect(
      proposeAgent({
        draft: draft([]),
        kind: "local",
        creatorRole: "admin",
        features: [],
        creatorIsAdmin: true
      })
    ).toMatchObject({ kind: "rejected", reason: "no_operations" });
  });

  it("respects a disabled feature, because the ceiling shrinks first", () => {
    const enabled = proposeAgent({
      draft: draft(["get"]),
      kind: "local",
      creatorRole: "admin",
      features: [],
      creatorIsAdmin: true
    });
    const disabled = proposeAgent({
      draft: draft(["get"]),
      kind: "local",
      creatorRole: "admin",
      features: [{ id: "people", enabled: false }],
      creatorIsAdmin: true
    });

    expect(enabled.kind).toBe("proposable");
    // With `people` disabled, `get` leaves the ceiling, so the proposal must fail.
    if (enabled.kind === "proposable") expect(enabled.within).toContain("get");
    expect(disabled.kind).toBe("rejected");
  });
});

describe("effectiveGrant", () => {
  it("keeps what still resolves", () => {
    expect(
      effectiveGrant({ stored: ["get", "search"], creatorRole: "teacher", features: [] })
    ).toEqual(["get", "search"]);
  });

  it("drops what no longer resolves instead of widening it", () => {
    const stored = ["get", "update"];
    const effective = effectiveGrant({ stored, creatorRole: "parent", features: [] });
    expect(effective).toContain("get");
    expect(effective).not.toContain("update");
    // Never adding anything is the invariant: effective ⊆ stored, always.
    for (const operation of effective) expect(stored).toContain(operation);
  });

  it("surfaces what was dropped", () => {
    expect(
      droppedGrant({ stored: ["get", "update"], creatorRole: "parent", features: [] })
    ).toEqual(["update"]);
  });

  it("shrinks when a feature is disabled", () => {
    const before = effectiveGrant({ stored: ["get"], creatorRole: "admin", features: [] });
    const after = effectiveGrant({
      stored: ["get"],
      creatorRole: "admin",
      features: [{ id: "people", enabled: false }]
    });
    expect(before).toContain("get");
    expect(after).not.toContain("get");
  });
});

describe("agentInstructions", () => {
  it("states the effective grant, not the requested one", () => {
    const instructions = agentInstructions(
      {
        id: "a-1",
        workspaceId: "ws-1",
        createdBy: "u-1",
        name: "Assessment",
        purpose: "Prepare marksheets",
        model: "openrouter/auto",
        kind: "local",
        operationIds: ["get", "update"],
        createdAt: 0,
        ceilingSnapshot: ["get"]
      },
      ["get"]
    );

    expect(instructions).toContain("- get");
    expect(instructions).not.toContain("- update");
    expect(instructions).toContain("not yours to do");
  });
});

describe("tenant packages", () => {
  it("validates the school package", () => {
    const result = validatePackage(schoolPackage);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.package?.bots.length).toBeGreaterThan(0);
  });

  it("validates the generic package with no code change", () => {
    // The tier-1 requirement: a non-school package is the same schema, and the
    // loader needs no branch for it.
    const result = validatePackage(genericPackage);
    expect(result.ok).toBe(true);
    expect(result.package?.template).toBe("generic");
  });

  it("enables no first-party pack for a generic tenant", () => {
    expect(packageFeatures(validatePackage(genericPackage).package!)).toEqual([]);
  });

  it("enables the school packs for a school tenant", () => {
    expect(packageFeatures(validatePackage(schoolPackage).package!)).toContain("assessment");
  });

  it("rejects a default model outside the allowlist", () => {
    const broken = { ...schoolPackage, model: { ...schoolPackage.model, default: "gpt-unlisted" } };
    const result = validatePackage(broken);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === "model.default")).toBe(true);
  });

  it("reports every problem, not just the first", () => {
    const broken = {
      ...schoolPackage,
      model: { ...schoolPackage.model, default: "gpt-unlisted" },
      channels: [
        { key: "chat", name: "Chat", surfaces: ["chat"] },
        { key: "chat", name: "Duplicate", surfaces: ["chat"] }
      ]
    };
    const result = validatePackage(broken);
    expect(result.issues.length).toBeGreaterThan(1);
  });

  it("rejects a bot pointing at an unknown channel", () => {
    const broken = {
      ...schoolPackage,
      bots: [{ ...schoolPackage.bots[0], channel: "ghost" }]
    };
    const result = validatePackage(broken);
    expect(result.issues.some((issue) => issue.message.includes("unknown channel"))).toBe(true);
  });

  it("ships no credential or secret in a package", () => {
    const serialised = JSON.stringify(schoolPackage) + JSON.stringify(genericPackage);
    expect(serialised).not.toMatch(/api[_-]?key|secret|token|password/i);
  });

  it("never wildcards the model allowlist", () => {
    for (const pack of [schoolPackage, genericPackage]) {
      expect(pack.model.allowed).not.toContain("*");
      expect(pack.model.allowed.length).toBeGreaterThan(0);
    }
  });
});
