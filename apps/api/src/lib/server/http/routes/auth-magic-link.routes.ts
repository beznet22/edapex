import { Hono } from "hono";

import { AuthError, MagicLinkService, createService } from "../../services";
import { setSessionCookie } from "../cookies";
import type { AppContext } from "../env";
import { magicLinkBody } from "../schemas/auth";
import { jsonBody } from "../validation";

export const authMagicLink = new Hono<AppContext>()
  .post("/magic-link", jsonBody(magicLinkBody), async (c) => {
    await createService(MagicLinkService, c.get("baseCtx")).request({
      email: c.req.valid("json").email,
      ip: c.get("ip"),
      userAgent: c.get("userAgent"),
      origin: new URL(c.req.url).origin
    });
    c.header("Cache-Control", "no-store");
    return c.json({ status: "pending" }, 202);
  })
  .get("/magic-link/verify", async (c) => {
    const token = c.req.query("token");
    if (token === undefined || token.length === 0) {
      throw new AuthError("This sign-in link is invalid or expired");
    }

    const result = await createService(MagicLinkService, c.get("baseCtx")).verify({
      token,
      ip: c.get("ip"),
      userAgent: c.get("userAgent"),
      fingerprint: null
    });
    setSessionCookie(c, result.token, result.expiresAt);
    c.header("Cache-Control", "no-store");
    return c.redirect(c.get("baseCtx").ports.authConfig.postLoginRedirect, 302);
  });
