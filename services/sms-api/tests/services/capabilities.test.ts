import { describe, expect, it } from "vitest";

import {
  CAPABILITY_LIMITS,
  CAPABILITY_ROLES,
  allowedOperationIds,
  applicationDraftSchema,
  buildCapabilityManifest,
  validateAgentGrant,
  validateAllRolePacks
} from "@edapex/contracts";
import { isHostCapabilities, isServerCapabilities } from "@edapex/contracts/platform";

describe("capability contract", () => {
  it("keeps every role pack within the 5-tool and 8-operation budgets", () => {
    expect(validateAllRolePacks()).toEqual([]);
    for (const role of CAPABILITY_ROLES) {
      const manifest = buildCapabilityManifest(role);
      expect(manifest.role).toBe(role);
      expect(manifest.limits).toEqual(CAPABILITY_LIMITS);
      for (const pack of manifest.packs) {
        expect(pack.tools.length).toBeLessThanOrEqual(CAPABILITY_LIMITS.maxTools);
        for (const tool of pack.tools) {
          expect(tool.operations.length).toBeLessThanOrEqual(
            CAPABILITY_LIMITS.maxOperationsPerTool
          );
          for (const operation of tool.operations) {
            expect(operation.roles).toContain(role);
          }
        }
      }
    }
  });

  it("does not expose admin-only tools to parents or students", () => {
    const parent = buildCapabilityManifest("parent");
    const admin = buildCapabilityManifest("admin");
    const parentToolIds = parent.packs.flatMap((pack) => pack.tools.map((tool) => tool.id));
    const adminToolIds = admin.packs.flatMap((pack) => pack.tools.map((tool) => tool.id));
    expect(parentToolIds).not.toContain("admin_issues");
    expect(parentToolIds).not.toContain("admissions");
    expect(adminToolIds).toContain("admin_issues");
  });

  it("keeps host and server capabilities as separate contracts", () => {
    expect(
      isHostCapabilities({
        nativeAgent: true,
        localOcr: true,
        screenshotCapture: true,
        cameraPreview: false,
        browserAssistance: false,
        mobileSafeToolsOnly: false
      })
    ).toBe(true);
    expect(
      isServerCapabilities({ webSearch: true, webFetch: true, cloudOcr: true })
    ).toBe(true);
    expect(isHostCapabilities({ nativeAgent: true })).toBe(false);
  });

  it("validates the public applicant draft contract", () => {
    const valid = applicationDraftSchema.safeParse({
      applicant: { firstName: "Ada", lastName: "Okafor" },
      contact: { email: "ada@example.test" },
      guardian: { name: "Grace Okafor", relationship: "mother" }
    });
    expect(valid.success).toBe(true);

    const missingContact = applicationDraftSchema.safeParse({
      applicant: { firstName: "Ada", lastName: "Okafor" },
      contact: {},
      guardian: { name: "Grace Okafor", relationship: "mother" }
    });
    expect(missingContact.success).toBe(false);
  });
  it("filters disabled tenant features before applying the 5-tool cap", () => {
    const unfiltered = buildCapabilityManifest("admin");
    const filtered = buildCapabilityManifest("admin", [
      { id: "admin_issues", enabled: false }
    ]);
    const unfilteredIds = unfiltered.packs.flatMap((pack) =>
      pack.tools.map((tool) => tool.id)
    );
    const filteredIds = filtered.packs.flatMap((pack) => pack.tools.map((tool) => tool.id));

    expect(unfilteredIds).toContain("admin_issues");
    expect(filteredIds).not.toContain("admin_issues");
    expect(filteredIds.length).toBe(unfilteredIds.length - 1);
    for (const pack of filtered.packs) {
      expect(pack.tools.length).toBeLessThanOrEqual(CAPABILITY_LIMITS.maxTools);
    }
  });

  it("treats an empty feature list as no filtering", () => {
    expect(buildCapabilityManifest("admin", [])).toEqual(buildCapabilityManifest("admin"));
  });

  it("bounds an agent grant by its creator's ceiling", () => {
    const adminOperations = allowedOperationIds("admin");
    const parentOperations = allowedOperationIds("parent");

    const narrowed = validateAgentGrant(
      { agentId: "agent-1", operationIds: ["search"] },
      "admin"
    );
    expect(narrowed).toEqual([]);

    // Privilege escalation: a parent may not grant an operation only admin holds.
    const escalated = validateAgentGrant(
      { agentId: "agent-2", operationIds: ["search", "apply"] },
      "parent"
    );
    expect(escalated.length).toBeGreaterThan(0);
    for (const violation of escalated) {
      expect(violation).toContain("agent-2");
    }

    // An empty grant list is always valid.
    expect(validateAgentGrant({ agentId: "agent-3", operationIds: [] }, "student")).toEqual([]);
  });

  it("shrinks an agent grant when a feature is disabled", () => {
    const before = allowedOperationIds("admin");
    const after = allowedOperationIds("admin", [{ id: "admin_issues", enabled: false }]);
    expect(after.size).toBeLessThan(before.size);
    for (const id of after) {
      expect(before.has(id)).toBe(true);
    }
  });
});
