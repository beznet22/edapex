import { describe, expect, it } from "vitest";

import {
  CAPABILITY_LIMITS,
  CAPABILITY_ROLES,
  applicationDraftSchema,
  buildCapabilityManifest,
  validateAllRolePacks
} from "@edapex/contracts";

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
});
