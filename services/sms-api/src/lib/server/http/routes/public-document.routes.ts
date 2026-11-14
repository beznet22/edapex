import { Hono } from "hono";

import { PublicDocumentService, createService } from "../../services";
import type { AppContext } from "../env";
import { tokenParams } from "../schemas/archive";
import { routeParams } from "../validation";

export const publicDocument = new Hono<AppContext>().get(
  "/r/:token",
  routeParams(tokenParams),
  async (c) => {
    const { token } = c.req.valid("param");
    const view = await createService(PublicDocumentService, c.get("baseCtx")).resolve(token);
    c.header("Cache-Control", "private, no-store");
    return c.json(view, 200);
  }
);
