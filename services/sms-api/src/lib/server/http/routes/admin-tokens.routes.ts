import { Hono } from "hono";

import { PublicDocumentService, createService } from "../../services";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { tokenIdParams } from "../schemas/archive";
import { routeParams } from "../validation";

export const adminTokens = new Hono<AppContext>().post(
  "/tokens/:tokenId/revoke",
  routeParams(tokenIdParams),
  async (c) => {
    const { tokenId } = c.req.valid("param");
    await createService(PublicDocumentService, c.get("ctx")).revoke(
      tokenId,
      currentUserId(c)
    );
    return c.body(null, 204);
  }
);
