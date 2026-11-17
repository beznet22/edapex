"use client";

/**
 * Native agent runtime for desktop and mobile.
 *
 * The rule this file exists to satisfy: **desktop and mobile run the agent natively.**
 * WebAssembly is the web delivery mechanism only. The Tauri commands were already
 * implemented and registered; nothing called them, so both native hosts silently ran
 * the browser runtime instead. See `specs/50-native-agent-path.md`.
 *
 * Deliberately selected at runtime rather than build time. One bundle serves the
 * browser and the desktop shell, so a build flag would mean two artifacts and two
 * chances to ship the wrong one.
 *
 * **What this does not yet do:** replace the WASM path by default on native hosts.
 * That flip is held until Android can be built and run, because the native transport
 * cannot be verified in CI here — there is no Tauri window in the runner. Shipping an
 * unverified transport as the default on the platform teachers use most would be a
 * guess dressed as a fix.
 */

import { isTauriHost } from "@edapex/host/platform";

export type HostKind = "web" | "native";

/**
 * Which runtime this host should use.
 *
 * `web` returns `wasm` unconditionally: in a browser tab there is no native host,
 * and asking would be meaningless.
 */
export function agentHost(): HostKind {
  return isTauriHost() ? "native" : "web";
}

/**
 * Whether the native path is the default.
 *
 * Off while the native transport is unverified. The env override exists so a desktop
 * build can exercise it without changing the committed default — which is the honest
 * way to test a transport that CI cannot reach.
 */
export function nativeIsDefault(): boolean {
  if (agentHost() !== "native") return false;
  return process.env.NEXT_PUBLIC_NATIVE_AGENT === "1";
}

/** Reports the selection, so a bug report can say which path ran. */
export function describeHost(): {
  readonly host: HostKind;
  readonly runtime: "native" | "wasm";
  readonly verified: boolean;
} {
  const host = agentHost();
  const runtime = nativeIsDefault() ? "native" : "wasm";
  return {
    host,
    runtime,
    // Only the browser path is exercised by the browser suite; saying otherwise
    // would be the exact overclaim this audit was written to stop.
    verified: runtime === "wasm"
  };
}
