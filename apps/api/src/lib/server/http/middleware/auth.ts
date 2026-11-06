import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

import { createService, SessionService } from "../../services";
import { AuthError } from "../../services/errors";
import { SESSION_COOKIE } from "../cookies";
import type { AppContext } from "../env";

export { SESSION_COOKIE };

export const auth: MiddlewareHandler<AppContext> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE) ?? null;
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
