import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";

import type { AppContext } from "./env";

/** `04 §8`: opaque `__Host-` cookies, HttpOnly, Secure, SameSite=Lax. */
export const SESSION_COOKIE = "__Host-edapex_session";
export const CLAIM_COOKIE = "__Host-edapex_claim";
export const OAUTH_COOKIE = "__Host-edapex_oauth";

const maxAgeOf = (expiresAt: number): number =>
  Math.max(0, expiresAt - Math.floor(Date.now() / 1000));

const secureCookie = {
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
  path: "/"
} as const;

export const setSessionCookie = (
  c: Context<AppContext>,
  token: string,
  expiresAt: number
): void => {
  setCookie(c, SESSION_COOKIE, token, { ...secureCookie, maxAge: maxAgeOf(expiresAt) });
};

export const clearSessionCookie = (c: Context<AppContext>): void => {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
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
