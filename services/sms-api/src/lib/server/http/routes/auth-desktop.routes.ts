import { Hono } from "hono";

import {
  DesktopAuthService,
  GoogleService,
  createService
} from "../../services";
import { toUserDto } from "../dto/auth";
import type { AppContext } from "../env";
import { setOAuthCookie } from "../cookies";
import { desktopExchangeBody, desktopStartBody } from "../schemas/auth";
import { jsonBody } from "../validation";

export const authDesktop = new Hono<AppContext>()
  .post("/desktop/start", jsonBody(desktopStartBody), async (c) => {
    const config = c.get("baseCtx").ports.authConfig;
    if (!config.googleConfigured || config.cookieSecret === null) return c.notFound();

    const body = c.req.valid("json");
    const result = await createService(GoogleService, c.get("baseCtx")).start({
      purpose: "desktop",
      claimUserId: null,
      desktop: {
        codeChallenge: body.codeChallenge,
        redirectUri: body.redirectUri
      }
    });
    setOAuthCookie(c, result.oauthCookie, result.expiresAt);
    c.header("Cache-Control", "no-store");
    return c.json({ authorizeUrl: result.authorizeUrl, expiresAt: result.expiresAt }, 200);
  })
  .post("/desktop/exchange", jsonBody(desktopExchangeBody), async (c) => {
    const body = c.req.valid("json");
    const result = await createService(
      DesktopAuthService,
      c.get("baseCtx")
    ).exchange({
      code: body.code,
      codeVerifier: body.codeVerifier,
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
  });
