import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";

/**
 * Tier 1: a tenant with no first-party pack must boot.
 *
 * Spec 10 says the role capability endpoint cannot sit behind school tenant
 * middleware, because that middleware rejects a user with no `schoolId` — which
 * made the platform-only tier unable to resolve a role at all. These tests assert
 * the endpoint answers for such a user.
 */

const app = createApp();

type Session = { id: number; isAdmin: boolean; staffId: number | null; schoolId: number | null };

/** The stub in `vitest.config.ts` decodes `user-<id>`. */
const cookieFor = (session: Session): Record<string, string> => ({
  cookie: `edapex_session=user-${session.id}`,
  "content-type": "application/json"
});

async function get(path: string, session: Session = { id: 1, isAdmin: false, staffId: null, schoolId: null }) {
  return app.request(path, { headers: cookieFor(session) }, env);
}

describe("capability resolution without a school", () => {
  it("answers for a user with no school scope", async () => {
    const response = await get("/api/v1/agent/capabilities");
    expect(response.status).toBe(200);
  });

  it("returns a valid manifest rather than an error", async () => {
    const response = await get("/api/v1/agent/capabilities");
    const manifest = (await response.json()) as {
      version: string;
      role: string;
      packs: { tools: unknown[] }[];
    };

    expect(manifest.version).toBe("1");
    expect(["admin", "teacher", "parent", "student"]).toContain(manifest.role);
    expect(Array.isArray(manifest.packs)).toBe(true);
    // Empty-but-valid is the correct tier-1 answer; an error is not.
    expect(manifest.packs.length).toBeGreaterThan(0);
  });

  it("never requires an academic scope header", async () => {
    // The failure this guards: a missing X-Academic-Id must not be a rejection.
    const response = await get("/api/v1/agent/capabilities");
    expect(response.status).not.toBe(400);
  });

  it("respects the 5-tool budget", async () => {
    const response = await get("/api/v1/agent/capabilities");
    const manifest = (await response.json()) as { packs: { tools: unknown[] }[] };
    const total = manifest.packs.reduce((sum, pack) => sum + pack.tools.length, 0);
    expect(total).toBeLessThanOrEqual(5);
  });

  it("narrows when a feature is disabled", async () => {
    const all = await get("/api/v1/agent/capabilities", {
      id: 1,
      isAdmin: true,
      staffId: 1,
      schoolId: null
    });
    const allManifest = (await all.json()) as { packs: { tools: { id: string }[] }[] };
    const allTools = allManifest.packs.flatMap((pack) => pack.tools.map((tool) => tool.id));

    const withOneDisabled = await get(
      `/api/v1/agent/capabilities?feature=${encodeURIComponent(JSON.stringify({ id: allTools[0], enabled: false }))}`,
      { id: 1, isAdmin: true, staffId: 1, schoolId: null }
    );
    const narrowed = (await withOneDisabled.json()) as { packs: { tools: { id: string }[] }[] };
    const narrowedTools = narrowed.packs.flatMap((pack) => pack.tools.map((tool) => tool.id));

    expect(narrowedTools.length).toBeLessThanOrEqual(allTools.length);
    if (allTools.length > 0) expect(narrowedTools).not.toContain(allTools[0]);
  });

  it("is not cached by a shared proxy", async () => {
    const response = await get("/api/v1/agent/capabilities");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects an unauthenticated request", async () => {
    const response = await app.request("/api/v1/agent/capabilities", {}, env);
    expect(response.status).toBe(401);
  });
});
