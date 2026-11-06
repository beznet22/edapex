import { Hono } from "hono";
import type { Context } from "hono";

import { StudentCodeSignInService, createService } from "../../services";
import { setSessionCookie } from "../cookies";
import { toUserDto } from "../dto/auth";
import type { AppContext } from "../env";
import { codeBody } from "../schemas/auth";
import { jsonBody } from "../validation";

const redeem = async (c: Context<AppContext>, code: string) =>
  createService(StudentCodeSignInService, c.get("baseCtx")).redeem({
    code,
    ip: c.get("ip"),
    userAgent: c.get("userAgent"),
    fingerprint: null
  });

export const authCode = new Hono<AppContext>()
  .post("/code", jsonBody(codeBody), async (c) => {
    const result = await redeem(c, c.req.valid("json").code);
    setSessionCookie(c, result.token, result.expiresAt);
    c.header("Cache-Control", "no-store");
    return c.json({ user: toUserDto(result.user), expiresAt: result.expiresAt }, 200);
  })
  .post("/mobile/code", jsonBody(codeBody), async (c) => {
    const result = await redeem(c, c.req.valid("json").code);
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
