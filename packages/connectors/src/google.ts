/**
 * Per-person Google connection.
 *
 * Two rules from the security spec shape this file:
 *
 * - **Per person, not per deployment.** There is no shared mailbox token. Each
 *   user connects their own account, and a connector call is made as that person.
 * - **Read and send are gated differently.** Reading goes through policy; sending
 *   always requires an explicit decision showing recipient and content.
 *
 * The token never leaves the Worker: the caller hands in a `withSecret` callback,
 * so this module receives an access token as an argument and never fetches one
 * from storage itself.
 */

import type { ConnectorAccess } from "@edapex/contracts";

/** Scopes requested per access level, so a read connection cannot send. */
export const GOOGLE_SCOPES: Readonly<Record<ConnectorAccess, readonly string[]>> = {
  read: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly"
  ],
  write: [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.file"
  ]
};

/**
 * The token exchange payload.
 *
 * `access_type=offline` is what returns a refresh token, without which the
 * connection silently dies an hour after it is made. `prompt=consent` forces that
 * refresh token on re-authorisation, which Google otherwise omits.
 */
export function authorisationUrl(input: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly access: ConnectorAccess;
  readonly state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_SCOPES[input.access].join(" "));
  url.searchParams.set("state", input.state);
  return url.toString();
}

/**
 * Which Google scopes a write call needs, by tool name.
 *
 * Explicit rather than derived from a regex: sending mail and creating a calendar
 * event need different scopes, and guessing wrong either fails at the API or asks
 * for more than the tool needs.
 */
export function requiredScope(toolName: string): string | null {
  if (/(^|_)gmail.*(send|reply|forward)/.test(toolName)) {
    return "https://www.googleapis.com/auth/gmail.send";
  }
  if (/(^|_)calendar.*(create|update|delete)/.test(toolName)) {
    return "https://www.googleapis.com/auth/calendar.events";
  }
  if (/(^|_)drive.*(create|update|delete)/.test(toolName)) {
    return "https://www.googleapis.com/auth/drive.file";
  }
  return null;
}

/**
 * Checks that a granted scope set covers the call.
 *
 * Called at use time, not at connect time: a connection made months ago may have
 * been granted fewer scopes than today's call needs.
 */
export function scopeCovers(grantedScopes: readonly string[], toolName: string): boolean {
  const needed = requiredScope(toolName);
  if (needed === null) return true;
  return grantedScopes.includes(needed);
}

/** A call that cannot be positively classified as a read is a write. */
export function classifyGoogleTool(toolName: string): ConnectorAccess {
  return requiredScope(toolName) === null ? "read" : "write";
}

/**
 * Redacts a Google error before it reaches a log or a response.
 *
 * Provider errors routinely echo the rejected token.
 */
export function redactGoogleError(message: string): string {
  return message
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/1\/\/[A-Za-z0-9._-]+/g, "[redacted]");
}

export interface GoogleCallInput {
  readonly accessToken: string;
  readonly endpoint: string;
  readonly method: "GET" | "POST";
  readonly body?: unknown;
}

export interface GoogleCallResult {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: string;
  readonly bytes?: number;
}

/** Calls the Google API as the connected person. The token is an argument, never stored here. */
export async function callGoogle(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
  input: GoogleCallInput
): Promise<GoogleCallResult> {
  // Fixed origin: the endpoint is a path, not a URL, so a caller cannot redirect
  // the token to another host by supplying an absolute URL.
  if (!input.endpoint.startsWith("/")) {
    return { ok: false, error: "The endpoint must be an absolute path." };
  }

  let response: Response;
  try {
    response = await fetchImpl(`https://www.googleapis.com${input.endpoint}`, {
      method: input.method,
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/json",
        ...(input.body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
    });
  } catch {
    return { ok: false, error: "Google could not be reached." };
  }

  if (!response.ok) {
    // The response body is not read into the error: it can contain the token.
    return { ok: false, error: `Google returned ${response.status}.` };
  }

  const text = await response.text();
  return { ok: true, value: text.length > 0 ? JSON.parse(text) : null, bytes: text.length };
}
