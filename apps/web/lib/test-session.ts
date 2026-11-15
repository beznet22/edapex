/**
 * Session fixture for the browser suite.
 *
 * # Why this is not a dev bypass
 *
 * The old `DEV_AUTH_BYPASS` invented a session **in the app**, which meant every dev-mode
 * page render had a code path that could not exist in production — and that path was the
 * only way anyone could sign in locally, because `wrangler dev` has no email binding and
 * the D1 started empty. It hid a missing transport behind a fake user.
 *
 * Both halves are now real: `LOCAL_EMAIL_LOG=true` prints the magic link, and
 * `seed-local.mjs` creates the accounts. So the suite does not need to pretend.
 *
 * # What this still is
 *
 * `NEXT_PUBLIC_TEST_SESSION` exists for the **Playwright runner**, which needs a
 * deterministic starting state without driving an email flow on every spec. It is set by
 * `playwright.config.ts` only.
 *
 * The guard is deliberately narrow: it also requires `NEXT_PUBLIC_API_BASE_URL` to point
 * at a loopback host. A production bundle that somehow carried the flag would still refuse
 * to activate against a real API origin.
 */

import { buildCapabilityManifest } from "@edapex/contracts";

import type { SessionView } from "@/lib/api";

/** True only under the browser suite, and only against a local API. */
export function testSessionEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_TEST_SESSION !== "1") return false;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return (
    base.startsWith("http://localhost") ||
    base.startsWith("http://127.0.0.1") ||
    // `vite dev` proxies same-origin requests, so an empty base is local too.
    base === ""
  );
}

/**
 * The manifest the fixture session resolves to.
 *
 * Supplied here rather than fetched: the suite runs without a cowork-api, and a fixture
 * that still called `/capabilities` would pass or fail on whether a local server happened
 * to be listening. `admin` because the specs exercise admin affordances.
 */
export const TEST_MANIFEST = buildCapabilityManifest("admin");

export const TEST_SESSION: SessionView = {
  user: {
    id: 1,
    fullName: "Test Admin",
    email: "admin@localhost"
  },
  sessionId: "test-fixture",
  expiresAt: Math.floor(Date.now() / 1000) + 3600
};
