import { Hono } from "hono";

import {
  DESKTOP_REDIRECT_URI,
  DesktopAuthService,
  GoogleService,
  SessionService,
  createService,
  isClaimTicketPayload,
  isGoogleStatePayload,
  verifyPayload
} from "../../services";
import { AuthError } from "../../services/errors";
import {
  clearClaimCookie,
  clearOAuthCookie,
  readClaimCookie,
  readOAuthCookie,
  setOAuthCookie,
  setSessionCookie
} from "../cookies";
import type { AppContext } from "../env";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export const authGoogle = new Hono<AppContext>()
  .get("/google/start", async (c) => {
    const config = c.get("baseCtx").ports.authConfig;
    if (!config.googleConfigured || config.cookieSecret === null) return c.notFound();

    let claimUserId: number | null = null;
    let allowEmailChange = false;
    let claimLinkId: string | null = null;
    const ticket = readClaimCookie(c);
    if (ticket !== null) {
      const payload = await verifyPayload(
        config.cookieSecret,
        ticket,
        isClaimTicketPayload,
        nowSeconds()
      );
      if (payload === null) clearClaimCookie(c);
      else {
        claimUserId = payload.userId;
        allowEmailChange = payload.allowEmailChange === true;
        claimLinkId = payload.claimLinkId ?? null;
      }
    }

    const result = await createService(GoogleService, c.get("baseCtx")).start({
      purpose: claimUserId === null ? "signin" : "claim",
      claimUserId,
      allowEmailChange,
      claimLinkId
    });
    setOAuthCookie(c, result.oauthCookie, result.expiresAt);
    c.header("Cache-Control", "no-store");

    if (c.get("wantsHtml")) return c.redirect(result.authorizeUrl, 302);
    return c.json({ authorizeUrl: result.authorizeUrl, expiresAt: result.expiresAt }, 200);
  })
  .get("/google/callback", async (c) => {
    const config = c.get("baseCtx").ports.authConfig;
    if (!config.googleConfigured || config.cookieSecret === null) return c.notFound();

    const url = new URL(c.req.url);
    if (url.searchParams.get("error") !== null) {
      throw new AuthError("Google sign-in was cancelled");
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookie = readOAuthCookie(c);
    if (code === null || state === null || cookie === null) {
      throw new AuthError("The OAuth state is missing");
    }

    const payload = await verifyPayload(
      config.cookieSecret,
      cookie,
      isGoogleStatePayload,
      nowSeconds()
    );
    clearOAuthCookie(c);
    clearClaimCookie(c);
    if (payload === null || payload.state !== state) {
      throw new AuthError("The OAuth state is invalid or expired");
    }

    const result = await createService(GoogleService, c.get("baseCtx")).callback({
      code,
      codeVerifier: payload.verifier,
      purpose: payload.purpose,
      claimUserId: payload.userId,
      allowEmailChange: payload.allowEmailChange,
      claimLinkId: payload.claimLinkId,
      ip: c.get("ip"),
      userAgent: c.get("userAgent"),
      fingerprint: null
    });

    if (payload.purpose === "desktop") {
      const challenge = payload.desktopCodeChallenge;
      const redirectUri = payload.desktopRedirectUri;
      if (challenge === null || redirectUri !== DESKTOP_REDIRECT_URI) {
        throw new AuthError("The desktop OAuth state is invalid");
      }
      await createService(SessionService, c.get("baseCtx")).logout(result.token);
      const desktopCode = await createService(
        DesktopAuthService,
        c.get("baseCtx")
      ).createCode(result.user.id, challenge, redirectUri);
      c.header("Cache-Control", "no-store");
      return c.redirect(
        `${redirectUri}?code=${encodeURIComponent(desktopCode)}`,
        302
      );
    }

    setSessionCookie(c, result.token, result.expiresAt);
    c.header("Cache-Control", "no-store");
    return c.redirect(config.postLoginRedirect, 302);
  });
