import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";

import type { AppContext } from "./env";

/**
 * Session cookies.
 *
 * # Production: `__Host-` + Secure
 *
 * `04 §8` calls for opaque `__Host-` cookies, HttpOnly, Secure, SameSite=Lax. The `__Host-`
 * prefix is the strongest available signal: a browser refuses to set such a cookie unless it
 * is `Secure`, has `Path=/` and carries no `Domain`, which means a subdomain cannot overwrite
 * it. That is exactly what a session cookie should be.
 *
 * # Local: the prefix cannot survive plain HTTP
 *
 * `__Host-` *requires* `Secure`. Chromium treats `http://localhost` as a secure context and
 * allows it anyway, but Firefox and Safari are stricter, and a page served over plain HTTP
 * that tries to set a Secure cookie is rejected. The symptom is not an error — it is a
 * successful sign-in that is immediately forgotten.
 *
 * So when the request is plain HTTP on a loopback host, the cookie drops the prefix and the
 * `Secure` flag. Everything else stays: HttpOnly, SameSite=Lax, Path=/. That branch is keyed
 * on the *request*, not on an environment variable — a deployed Worker only ever sees HTTPS,
 * so it can never take it.
 */

const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * True when this request is a plain-HTTP loopback request.
 *
 * Read from the URL the Worker was called with. Behind `wrangler dev` that is
 * `http://localhost:8787`; behind Cloudflare it is always `https`.
 */
function isLoopbackHttp(c: Context<AppContext>): boolean {
  try {
    const url = new URL(c.req.url);
    if (url.protocol !== "http:") return false;
    return DEV_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The cookie name for a request URL.
 *
 * Exported as a pure function so both branches are testable: over HTTPS the `__Host-` prefix
 * is what stops a subdomain overwriting the session, and that behaviour must have coverage
 * rather than being an untested `if`.
 */
export function sessionCookieNameFor(url: string): string {
  try {
    const parsed = new URL(url);
    const loopback = parsed.protocol === "http:" && DEV_HOSTS.has(parsed.hostname);
    return loopback ? "edapex_session" : "__Host-edapex_session";
  } catch {
    // Unparseable means we cannot prove it is loopback, so assume the strict name.
    return "__Host-edapex_session";
  }
}

/** The cookie name for this request. Prefix only where the browser can honour it. */
export const sessionCookieName = (c: Context<AppContext>): string =>
  sessionCookieNameFor(c.req.url);

const SESSION_COOKIE = "__Host-edapex_session";
const CLAIM_COOKIE = "__Host-edapex_claim";
const OAUTH_COOKIE = "__Host-edapex_oauth";
const DEV_SESSION_COOKIE = "edapex_session";

const maxAgeOf = (expiresAt: number): number =>
  Math.max(0, expiresAt - Math.floor(Date.now() / 1000));

const secureCookie = {
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
  path: "/"
} as const;

/** Same protections, minus the two the browser will reject over plain HTTP. */
const loopbackCookie = {
  httpOnly: true,
  secure: false,
  sameSite: "Lax",
  path: "/"
} as const;

export const setSessionCookie = (
  c: Context<AppContext>,
  token: string,
  expiresAt: number
): void => {
  const loopback = isLoopbackHttp(c);
  setCookie(c, loopback ? DEV_SESSION_COOKIE : SESSION_COOKIE, token, {
    ...(loopback ? loopbackCookie : secureCookie),
    maxAge: maxAgeOf(expiresAt)
  });
};

/** Reads either name, so a session set before a restart is not silently dropped. */
export const readSessionCookie = (c: Context<AppContext>): string | null =>
  getCookie(c, sessionCookieName(c)) ??
  getCookie(c, SESSION_COOKIE) ??
  getCookie(c, DEV_SESSION_COOKIE) ??
  null;

export const clearSessionCookie = (c: Context<AppContext>): void => {
  // Both names, unconditionally: a leftover cookie under the other name would keep a
  // "signed out" browser signed in on the next request.
  for (const name of [SESSION_COOKIE, DEV_SESSION_COOKIE]) {
    deleteCookie(c, name, { path: "/", secure: name === SESSION_COOKIE });
  }
};

export const setClaimCookie = (
  c: Context<AppContext>,
  ticket: string,
  expiresAt: number
): void => {
  setCookie(c, CLAIM_COOKIE, ticket, { ...secureCookie, maxAge: maxAgeOf(expiresAt) });
};

export const readClaimCookie = (c: Context<AppContext>): string | null =>
  getCookie(c, CLAIM_COOKIE) ?? null;

export const clearClaimCookie = (c: Context<AppContext>): void => {
  deleteCookie(c, CLAIM_COOKIE, { path: "/", secure: true });
};

export const setOAuthCookie = (
  c: Context<AppContext>,
  payload: string,
  expiresAt: number
): void => {
  setCookie(c, OAUTH_COOKIE, payload, { ...secureCookie, maxAge: maxAgeOf(expiresAt) });
};

export const readOAuthCookie = (c: Context<AppContext>): string | null =>
  getCookie(c, OAUTH_COOKIE) ?? null;

export const clearOAuthCookie = (c: Context<AppContext>): void => {
  deleteCookie(c, OAUTH_COOKIE, { path: "/", secure: true });
};
