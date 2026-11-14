import { Hono } from "hono";

import { CLAIM_TICKET_TTL_SECONDS, ClaimService, createService } from "../../services";
import { setClaimCookie } from "../cookies";
import type { AppContext } from "../env";
import { claimBody } from "../schemas/auth";
import { jsonBody } from "../validation";

/**
 * `04a §3`: unknown and successful checks share one status and body. The only
 * difference is the signed, HttpOnly claim ticket, which scripts cannot read.
 */
export const authClaim = new Hono<AppContext>().post(
  "/claim",
  jsonBody(claimBody),
  async (c) => {
    if (!c.get("baseCtx").ports.authConfig.claimEnabled) return c.notFound();

    const body = c.req.valid("json");
    const result = await createService(ClaimService, c.get("baseCtx")).request({
      email: body.email,
      password: body.password,
      ip: c.get("ip"),
      userAgent: c.get("userAgent")
    });

    if (result.ticket !== null) {
      const expiresAt = Math.floor(Date.now() / 1000) + CLAIM_TICKET_TTL_SECONDS;
      setClaimCookie(c, result.ticket, expiresAt);
    }
    c.header("Cache-Control", "no-store");
    return c.json({ status: "pending" }, 202);
  }
);
