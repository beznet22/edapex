import { afterEach, describe, expect, it, vi } from "vitest";

import { agentHost, describeHost, nativeIsDefault } from "@/lib/agent-host";

/**
 * Host selection.
 *
 * The regression this guards is real and already happened once: the Tauri commands
 * existed, the frontend never called them, and desktop silently ran the browser
 * runtime for weeks. A branch that can revert without a failing test will revert.
 */

// Vitest runs in Node, where `window` does not exist. `isTauriHost()` guards with
// `typeof window`, so the test supplies one rather than assuming a DOM.
afterEach(() => {
  if (typeof window !== "undefined") {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  }
  delete process.env.NEXT_PUBLIC_NATIVE_AGENT;
});

function pretendTauri(): void {
  const scope = globalThis as unknown as { window?: Record<string, unknown> };
  scope.window ??= {};
  scope.window.__TAURI_INTERNALS__ = {};
}

describe("agentHost", () => {
  it("is web in a browser tab", () => {
    expect(agentHost()).toBe("web");
  });

  it("is native inside the Tauri shell", () => {
    pretendTauri();
    expect(agentHost()).toBe("native");
  });
});

describe("nativeIsDefault", () => {
  it("is never true on the web, whatever the env says", () => {
    process.env.NEXT_PUBLIC_NATIVE_AGENT = "1";
    expect(nativeIsDefault()).toBe(false);
  });

  it("stays off on native until the transport is verified", () => {
    pretendTauri();
    // The default is deliberately unflipped: the native transport cannot be
    // exercised by CI, so making it the default would be an unverified guess on the
    // platform teachers use most.
    expect(nativeIsDefault()).toBe(false);
  });

  it("can be enabled explicitly for a desktop build to exercise it", () => {
    pretendTauri();
    process.env.NEXT_PUBLIC_NATIVE_AGENT = "1";
    expect(nativeIsDefault()).toBe(true);
  });
});

describe("describeHost", () => {
  it("reports the browser path as verified", () => {
    expect(describeHost()).toEqual({ host: "web", runtime: "wasm", verified: true });
  });

  it("reports the native path as unverified", () => {
    pretendTauri();
    process.env.NEXT_PUBLIC_NATIVE_AGENT = "1";
    // `verified` is false because no test here runs the native transport. Claiming
    // otherwise is what this audit was written to stop.
    expect(describeHost()).toEqual({ host: "native", runtime: "native", verified: false });
  });
});
