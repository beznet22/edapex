import { getRequestEvent } from "$app/server";
import type { CookieOpts } from "$lib/types/auth-types";

const isProd = process.env.NODE_ENV === "production";
const COOKIE_GRACE_SEC = 60; // 1 minute buffer: Grace period

const defaults: Omit<CookieOpts, "name"> = {
  path: "/",
  httpOnly: true,
  secure: isProd,
  sameSite: "strict",
};

export const cookies = {
  get(name: string): string | undefined {
    return getRequestEvent().cookies.get(name);
  },

  /**
   * Set cookie with expiration synced to token exp timestamp
   * @param name - cookie name
   * @param value - cookie value (token)
   * @param expTimestamp - absolute expiration timestamp (seconds since epoch) from JWT
   * @param opts - optional cookie options
   */
  set(name: string, value: string, expTimestamp: number, opts: Partial<CookieOpts> = {}) {
    const { path, httpOnly, secure, sameSite, domain } = { ...defaults, ...opts };
    const expiresMs = (expTimestamp + COOKIE_GRACE_SEC) * 1000;
    getRequestEvent().cookies.set(name, value, {
      path: path!,
      httpOnly,
      secure,
      sameSite,
      domain,
      expires: new Date(expiresMs),
    });
  },

  del(name: string, opts: Partial<CookieOpts> = {}) {
    const { path, domain } = { ...defaults, ...opts };
    getRequestEvent().cookies.delete(name, { path: path!, domain });
  },
};
