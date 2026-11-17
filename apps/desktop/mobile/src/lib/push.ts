import { invoke } from "@tauri-apps/api/core";

import { readPushToken } from "./host-bridge";

const INSTALL_KEY = "edapex.install";

export type PushRegistration = "registered" | "no_host" | "no_token" | "signed_out";

/**
 * One id per install.
 *
 * The server upserts on `(user, installId)`, so a token rotation updates the row instead of
 * adding a second device — which is how one phone becomes five rows and five copies of every
 * notification.
 */
export function installId(): string {
  try {
    const existing = window.localStorage.getItem(INSTALL_KEY);
    if (existing !== null && existing.length > 0) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(INSTALL_KEY, created);
    return created;
  } catch {
    // A WebView with storage disabled still works for this session; it just re-registers
    // on the next launch.
    return crypto.randomUUID();
  }
}

export function pushDeviceBody(token: string, id: string) {
  return { platform: "android", token, installId: id } as const;
}

/**
 * Tell the server where this install is.
 *
 * The request goes through the native proxy, so the session token stays in the keychain and
 * out of the page. `signed_out` is a normal answer, not a failure: registration runs at
 * launch, which is often before anyone has signed in on a fresh install.
 */
export async function registerPushDevice(): Promise<PushRegistration> {
  if (typeof window === "undefined" || window.__TAURI_INTERNALS__ === undefined) {
    return "no_host";
  }
  const token = readPushToken();
  if (token === null) return "no_token";

  const status = await invoke<{ authenticated: boolean }>("auth_status");
  if (!status.authenticated) return "signed_out";

  await invoke("api_request", {
    method: "POST",
    path: "/api/v1/devices",
    body: pushDeviceBody(token, installId()),
    headers: null
  });
  return "registered";
}
