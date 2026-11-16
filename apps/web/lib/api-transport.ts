import { isTauriHost } from "@/lib/platform";
import { apiRequest } from "@/lib/tauri";

/**
 * How a request reaches the API, per host.
 *
 * # Why this exists
 *
 * On the web the session is an httpOnly `__Host-edapex_session` cookie and `fetch` attaches
 * it automatically. Inside a Tauri WebView that does not work: the cookie is per-app, the API
 * is a different origin, and `__Host-` requires `Secure` + `Path=/` + no `Domain` — none of
 * which a cross-origin WebView request satisfies.
 *
 * AGENTS.md is explicit that the WebView must never hold the session token: *"Use the native
 * `api_request` proxy and the OS keychain/Keystore only."* So on a native host every call
 * goes through Rust, which reads the token from the OS keychain and attaches it as a Bearer
 * header.
 *
 * # One seam
 *
 * Everything above this module — `getSession`, `loadCapabilities`, the admin API, the agent
 * runtime — calls `apiFetch` and does not know which host it is on. That is deliberate: the
 * alternative is a host branch at every call site, which is the kind of duplication that
 * drifts until one path is broken and nobody notices because they only tested the web.
 */
export type HostKind = "web" | "native";

export const hostKind = (): HostKind => (isTauriHost() ? "native" : "web");

export interface ApiRequestInit {
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ApiResponse {
  readonly ok: boolean;
  readonly status: number;
  /** Parsed JSON, or null when the body was empty or not JSON. */
  readonly data: unknown;
}

/**
 * Performs one API call on whichever transport this host has.
 *
 * `path` is absolute (`/api/v1/...`) because the native proxy takes it verbatim and prefixes
 * its own base — the Rust side reads `EDAPEX_API_BASE`. The web path prefixes `base()`.
 */
export async function apiFetch(
  path: string,
  base: string,
  init: ApiRequestInit = {}
): Promise<ApiResponse> {
  if (hostKind() === "native") {
    /*
     * The native proxy returns the parsed body and throws a `HostError` for transport
     * failures. It does not expose a status code, so a call that "succeeded" is one that did
     * not throw — the API's error envelope is thrown as an error on that path, which is why
     * `readMessage` handles both shapes.
     */
    try {
      const data = await apiRequest(
        init.method ?? "GET",
        path,
        init.body === undefined ? undefined : (init.body as never),
        init.headers
      );
      return { ok: true, status: 200, data };
    } catch (cause) {
      /*
       * The Rust side throws on a non-2xx and carries the status in its `HostError`, so
       * `getSession` still has to tell 401 (anonymous) from a genuine failure. Returning a
       * synthetic response keeps one contract for both hosts instead of making every caller
       * handle "native throws where web returns".
       */
      const status = statusOf(cause);
      if (status !== null) return { ok: false, status, data: null };
      throw new Error(readMessage(cause, "The native API request failed"));
    }
  }

  const response = await fetch(`${base}${path}`, {
    ...(init.method === undefined ? {} : { method: init.method }),
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

  const data: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

/** The HTTP status inside a Rust `HostError`, when it carries one. */
function statusOf(cause: unknown): number | null {
  if (typeof cause !== "object" || cause === null) return null;
  const record = cause as Record<string, unknown>;
  const candidates = [record["status"], record["statusCode"], record["code"]];
  for (const value of candidates) {
    if (typeof value === "number" && value >= 100 && value <= 599) return value;
  }
  return null;
}

/**
 * The message out of an API error envelope, a Rust `HostError`, or anything else.
 *
 * The three shapes are genuinely different — `{message}`, `{message, code}` and a plain
 * `Error` — and every caller wants one string.
 */
export function readMessage(cause: unknown, fallback: string): string {
  if (typeof cause === "string" && cause.length > 0) return cause;
  if (typeof cause === "object" && cause !== null) {
    if ("message" in cause && typeof cause.message === "string") return cause.message;
    if ("data" in cause && typeof cause.data === "object" && cause.data !== null) {
      const data = cause.data as Record<string, unknown>;
      if (typeof data["message"] === "string") return data["message"];
    }
  }
  return fallback;
}
