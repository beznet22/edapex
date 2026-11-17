import { invoke } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";

export interface HostFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export function isHostFailure(value: unknown): value is HostFailure {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

/** Reads the keychain through Rust; the session token never enters the page. */
export async function isAuthenticated(): Promise<boolean> {
  const status = await invoke<{ authenticated: boolean }>("auth_status");
  return status.authenticated;
}

/** Opens the system browser at the provider. The verifier stays in Rust. */
export async function startSignIn(): Promise<void> {
  await invoke("auth_start");
}

/** Trade the one-time code for a session. The token is written to the keychain by Rust. */
export async function exchangeCode(code: string): Promise<void> {
  await invoke("auth_exchange", { code });
}

export async function signOut(): Promise<void> {
  await invoke("auth_logout");
}

/**
 * The code inside `edapex://auth?code=…`.
 *
 * Parsed rather than pattern-matched: a URL that says `auth` in a path segment is not an
 * auth callback, and a regex is how the wrong one gets accepted.
 */
export function codeFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "edapex:" || parsed.host !== "auth") return null;
  const code = parsed.searchParams.get("code");
  return code !== null && code.length > 0 ? code : null;
}

/**
 * Every code the platform hands us, past and future.
 *
 * A cold start carries the link that launched the app; a warm one arrives as an event.
 * Both paths call the handler, because the case that matters — the browser was open long
 * enough for Android to kill the app — is exactly the one the event never fires for.
 */
export async function watchAuthLinks(handler: (code: string) => void): Promise<() => void> {
  const current = await getCurrent();
  for (const url of current ?? []) {
    const code = codeFromUrl(url);
    if (code !== null) handler(code);
  }
  return onOpenUrl((urls) => {
    for (const url of urls) {
      const code = codeFromUrl(url);
      if (code !== null) handler(code);
    }
  });
}
