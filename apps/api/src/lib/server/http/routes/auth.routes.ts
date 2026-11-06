import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";

import { createService, AuthService, SessionService } from "../../services";
import { AuthError } from "../../services/errors";
import { toUserDto } from "../dto/auth";
import type { AppContext } from "../env";
import { SESSION_COOKIE } from "../middleware/auth";
import { loginBody, mobileTokenBody } from "../schemas/auth";
import { jsonBody } from "../validation";

const setSessionCookie = (
  c: Context<AppContext>,
  token: string,
  expiresAt: number
): void => {
  const now = Math.floor(Date.now() / 1000);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.max(0, expiresAt - now)
  });
};

const clearSessionCookie = (c: Context<AppContext>): void => {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
};

const sessionTokenOf = (c: Context<AppContext>): string => {
  const token = c.get("sessionToken");
  if (token === null) throw new AuthError();
  return token;
};

export const publicAuth = new Hono<AppContext>()
  .post("/login", jsonBody(loginBody), async (c) => {
    const body = c.req.valid("json");
    const result = await createService(AuthService, c.get("baseCtx")).login({
      identifier: body.identifier,
      password: body.password,
      ip: c.get("ip"),
      userAgent: c.get("userAgent")
    });
    setSessionCookie(c, result.token, result.expiresAt);
    c.header("Cache-Control", "no-store");
    return c.json(
      { user: toUserDto(result.user), expiresAt: result.expiresAt },
      200
    );
  })
  .post("/mobile/login", jsonBody(loginBody), async (c) => {
    const body = c.req.valid("json");
    const result = await createService(AuthService, c.get("baseCtx")).login({
      identifier: body.identifier,
      password: body.password,
      ip: c.get("ip"),
      userAgent: c.get("userAgent")
    });
    c.header("Cache-Control", "no-store");
    return c.json(
      {
        token: result.token,
        expiresAt: result.expiresAt,
        user: toUserDto(result.user)
      },
      200
    );
  })
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
