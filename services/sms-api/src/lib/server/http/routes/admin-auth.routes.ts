import { Hono } from "hono";

import { ClaimResetService, createService } from "../../services";
import { toClaimResetDto } from "../dto/admin";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { claimResetBody } from "../schemas/admin";
import { jsonBody } from "../validation";

export const adminAuth = new Hono<AppContext>().post(
  "/auth/claim-reset",
  jsonBody(claimResetBody),
  async (c) => {
    const result = await createService(ClaimResetService, c.get("ctx")).reset({
      actorUserId: currentUserId(c)
    });
    c.header("Cache-Control", "no-store");
    return c.json(toClaimResetDto(result), 200);
  }
);
