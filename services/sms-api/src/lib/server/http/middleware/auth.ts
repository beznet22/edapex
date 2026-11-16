import type { MiddlewareHandler } from "hono";

import { createService, SessionService } from "../../services";
import { AuthError } from "../../services/errors";
import { readSessionCookie, sessionCookieName } from "../cookies";
import type { AppContext } from "../env";

/**
 * Re-exported for callers that only need the canonical name.
 *
 * Resolution is request-dependent now (the `__Host-` prefix is dropped over plain-HTTP
 * loopback), so anything *reading* a cookie must use `readSessionCookie` instead.
 */
export { readSessionCookie, sessionCookieName };

const bearerToken = (header: string | undefined): string | null => {
  if (header === undefined) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
};

export const auth: MiddlewareHandler<AppContext> = async (c, next) => {
  const token = readSessionCookie(c) ?? bearerToken(c.req.header("authorization"));
  c.set("sessionToken", token);
  if (token === null) {
    c.set("session", null);
    c.set("user", null);
    await next();
    return;
  }
  const view = await createService(SessionService, c.get("baseCtx")).getSession(token);
  c.set("session", view);
  c.set("user", view?.user ?? null);
  await next();
};

export const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.get("user") === null) throw new AuthError();
  await next();
};
