import { Hono } from "hono";

import { ClaimLinkService, createService } from "../../services";
import { setClaimCookie } from "../cookies";
import type { AppContext } from "../env";
import { claimLinkExchangeBody } from "../schemas/auth";
import { jsonBody } from "../validation";

export const authClaimLink = new Hono<AppContext>().post(
  "/claim-link/exchange",
  jsonBody(claimLinkExchangeBody),
  async (c) => {
    const result = await createService(ClaimLinkService, c.get("baseCtx")).exchange({
      token: c.req.valid("json").token,
      ip: c.get("ip"),
      userAgent: c.get("userAgent")
    });
    setClaimCookie(c, result.ticket, result.expiresAt);
    c.header("Cache-Control", "no-store");
    return c.json({ status: "pending" }, 202);
  }
);
