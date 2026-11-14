import { Hono } from "hono";

import { buildCapabilityManifest } from "@edapex/contracts";
import type { CapabilityRole, TenantFeature } from "@edapex/contracts";

import type { AppContext } from "../env";
import { apiError } from "../schema";

/**
 * Capability resolution for a tenant with **no first-party pack**.
 *
 * Spec 10 tier 1: a user with no school scope must still resolve a role and
 * receive an empty-but-valid manifest. That is why this lives here rather than in
 * `sms-api` behind `createTenantMiddleware` — that middleware rejects a user with
 * no `schoolId`, which made the platform-only tier unable to boot at all.
 *
 * What this endpoint deliberately does *not* do is read school data. The role is
 * derived from the identity `sms-api` returns, and the manifest is a pure
 * function of that role plus the tenant's feature mask. No shop lookup, no
 * academic scope, no D1 statement.
 */

export interface IdentityFacts {
  readonly isAdmin: boolean;
  readonly isStaff: boolean;
  readonly isParent: boolean;
}

/**
 * Role from identity facts.
 *
 * `isParent` is supplied by the caller because it requires a lookup `sms-api`
 * owns; when absent, a non-staff user is a student. A tenant with no school has
 * staff=false, parent=false, so it resolves to `student` and gets the student
 * manifest — empty of school tools once no pack is enabled, which is the correct
 * tier-1 answer.
 */
export function resolveRole(facts: IdentityFacts): CapabilityRole {
  if (facts.isAdmin) return "admin";
  if (facts.isStaff) return "teacher";
  if (facts.isParent) return "parent";
  return "student";
}

/**
 * The tenant feature mask.
 *
 * Accepts `?feature={"id":"people","enabled":false}` from the query string and
 * the same shape as an object, so the route does not depend on whether the caller
 * is a browser or another Worker. An unparseable entry is ignored rather than
 * throwing: an unlisted feature means *enabled*, and a malformed mask must not
 * silently disable everything.
 */
export function resolveFeatures(input: unknown): TenantFeature[] {
  if (!Array.isArray(input)) return [];

  const features: TenantFeature[] = [];
  for (const entry of input) {
    let value: unknown = entry;
    if (typeof entry === "string") {
      try {
        value = JSON.parse(entry);
      } catch {
        continue;
      }
    }

    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { enabled?: unknown }).enabled === "boolean"
    ) {
      features.push({
        id: (value as { id: string }).id,
        enabled: (value as { enabled: boolean }).enabled
      });
    }
  }
  return features;
}

export const agentCapabilities = new Hono<AppContext>().get("/capabilities", (context) => {
  const identity = context.get("identity");

  const role = resolveRole({
    isAdmin: identity.isAdmin,
    isStaff: identity.staffId !== null,
    isParent: identity.isParent
  });

  const features = resolveFeatures(context.req.queries("feature") ?? []);

  let manifest;
  try {
    manifest = buildCapabilityManifest(role, features);
  } catch (error) {
    // A budget violation is a programming error, not a client error, and must not
    // be echoed: the message names internal pack ids.
    console.error("capability manifest failed", error);
    return context.json(apiError("Capability resolution failed.", "internal"), 500);
  }

  context.header("Cache-Control", "private, no-store");
  return context.json(manifest, 200);
});
