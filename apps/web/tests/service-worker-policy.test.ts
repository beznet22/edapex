import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

/**
 * Service-worker cache policy.
 *
 * The acceptance criterion is "no API or transcript in the cache". That cannot be
 * checked by grepping the worker for a path list: what matters is the decision
 * `isCacheable` makes. The worker already publishes it on `self` so this can
 * exercise the real implementation instead of a copy.
 */

interface ServiceWorkerPolicy {
  readonly isCacheable: (url: URL, request: { method: string }) => boolean;
  readonly NEVER_CACHE: readonly string[];
  readonly PRECACHE: readonly string[];
}

const ORIGIN = "https://api.llacademy.ng";

function loadPolicy(): ServiceWorkerPolicy {
  const source = readFileSync(join(import.meta.dirname, "..", "public", "sw.js"), "utf8");
  const sandbox: Record<string, unknown> = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: () => undefined
    },
    caches: { open: () => Promise.resolve({}), keys: () => Promise.resolve([]) },
    fetch: () => Promise.resolve(new Response()),
    URL,
    Response,
    Promise
  };
  runInNewContext(source, sandbox);

  const worker = sandbox.self as { __edapexServiceWorkerPolicy?: ServiceWorkerPolicy };
  if (worker.__edapexServiceWorkerPolicy === undefined) {
    throw new Error("The service worker did not expose its policy.");
  }
  return worker.__edapexServiceWorkerPolicy;
}

const url = (path: string, origin = ORIGIN): URL => new URL(path, origin);
const get = { method: "GET" };

describe("service worker cache policy", () => {
  const policy = loadPolicy();

  it("never caches API traffic", () => {
    for (const path of [
      "/api/v1/agent/model/chat/completions",
      "/api/v1/me",
      "/api/v1/students"
    ]) {
      expect(policy.isCacheable(url(path), get), path).toBe(false);
    }
  });

  it("never caches the agent runtime", () => {
    expect(policy.isCacheable(url("/agent-runtime/edapex_agent_wasm_bg.wasm"), get)).toBe(false);
    expect(policy.isCacheable(url("/agent-runtime/edapex_agent_wasm.js"), get)).toBe(false);
  });

  it("keeps denying the retired runtime paths", () => {
    // A client that cached the old payload must not be served it from a stale
    // entry, even though those paths no longer exist on the origin.
    expect(policy.isCacheable(url("/xcodex/current/xcodex_bg.wasm"), get)).toBe(false);
    expect(policy.isCacheable(url("/xrouter-browser/current/x.js"), get)).toBe(false);
  });

  it("caches immutable build assets", () => {
    expect(policy.isCacheable(url("/_next/static/chunks/app.js"), get)).toBe(true);
  });

  it("refuses non-GET and cross-origin requests", () => {
    expect(policy.isCacheable(url("/_next/static/chunks/app.js"), { method: "POST" })).toBe(false);
    expect(
      policy.isCacheable(url("/_next/static/chunks/app.js", "https://example.com"), get)
    ).toBe(false);
  });

  it("does not precache anything sensitive", () => {
    expect(policy.PRECACHE.length).toBeGreaterThan(0);
    for (const path of policy.PRECACHE) {
      expect(path.startsWith("/api/"), path).toBe(false);
      expect(path.startsWith("/agent-runtime/"), path).toBe(false);
      expect(path).not.toMatch(/transcript|session/i);
    }
  });
});
