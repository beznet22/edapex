import { Hono } from "hono";

import { ClaimLinkService, createService } from "../../services";
import {
  claimLinkDirectoryQuery,
  claimLinkIdParams,
  createClaimLinkBody
} from "../schemas/admin";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { jsonBody, queryParams, routeParams } from "../validation";

export const adminClaimLinks = new Hono<AppContext>()
  .get("/claim-links", queryParams(claimLinkDirectoryQuery), async (c) => {
    const query = c.req.valid("query");
    const page = await createService(ClaimLinkService, c.get("ctx")).list(query);
    c.header("Cache-Control", "no-store");
    return c.json(page, 200);
  })
  .post("/claim-links", jsonBody(createClaimLinkBody), async (c) => {
    const body = c.req.valid("json");
    const link = await createService(ClaimLinkService, c.get("ctx")).create({
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      ttlHours: body.ttlHours,
      adminUserId: currentUserId(c)
    });
    c.header("Cache-Control", "no-store");
    return c.json(link, 201);
  })
  .post(
    "/claim-links/:id/revoke",
    routeParams(claimLinkIdParams),
    async (c) => {
      await createService(ClaimLinkService, c.get("ctx")).revoke(c.req.valid("param").id);
      return c.body(null, 204);
    }
  );
