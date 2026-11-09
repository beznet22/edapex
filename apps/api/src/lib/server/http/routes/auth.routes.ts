import { Hono } from "hono";
import type { Context } from "hono";

import { AuthError, SessionService, createService } from "../../services";
import { clearSessionCookie, setSessionCookie } from "../cookies";
import type { AppContext } from "../env";
import { mobileTokenBody } from "../schemas/auth";
import { jsonBody } from "../validation";

const sessionTokenOf = (c: Context<AppContext>): string => {
  const token = c.get("sessionToken");
  if (token === null) throw new AuthError();
  return token;
};

export const publicAuth = new Hono<AppContext>()
  .post("/mobile/refresh", jsonBody(mobileTokenBody), async (c) => {
    const body = c.req.valid("json");
    const result = await createService(
      SessionService,
      c.get("baseCtx")
    ).refreshMobile(body.token);
    c.header("Cache-Control", "no-store");
    return c.json({ token: result.token, expiresAt: result.expiresAt }, 200);
  })
  .post("/mobile/logout", jsonBody(mobileTokenBody), async (c) => {
    const body = c.req.valid("json");
    await createService(SessionService, c.get("baseCtx")).logoutMobile(body.token);
    return c.body(null, 204);
  });

export const protectedAuth = new Hono<AppContext>()
  .post("/logout", async (c) => {
    await createService(SessionService, c.get("baseCtx")).logout(sessionTokenOf(c));
    clearSessionCookie(c);
    return c.body(null, 204);
  })
  .post("/logout-all", async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    await createService(SessionService, c.get("baseCtx")).logoutAll(user.id);
    clearSessionCookie(c);
    return c.body(null, 204);
  })
  .post("/refresh", async (c) => {
    const result = await createService(SessionService, c.get("baseCtx")).refresh(
      sessionTokenOf(c)
    );
    setSessionCookie(c, result.token, result.expiresAt);
    c.header("Cache-Control", "no-store");
    return c.json({ expiresAt: result.expiresAt }, 200);
  });
