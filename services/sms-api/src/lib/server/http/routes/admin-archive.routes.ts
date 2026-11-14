import { Hono } from "hono";

import { WipeService, createService } from "../../services";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { wipeBody } from "../schemas/archive";
import { jsonBody } from "../validation";

export const adminArchive = new Hono<AppContext>()
  .delete("/archive", jsonBody(wipeBody), async (c) => {
    const body = c.req.valid("json");
    const actorId = currentUserId(c);
    const service = createService(WipeService, c.get("ctx"));
    if (body.dryRun ?? true) {
      const view = await service.request({ sessionIds: body.sessionIds, actorId });
      c.header("Cache-Control", "no-store");
      return c.json(view, 202);
    }
    const view = await service.execute({
      sessionIds: body.sessionIds,
      confirm: body.confirm ?? "",
      secondAdminToken: body.secondAdminToken ?? "",
      actorId
    });
    c.header("Cache-Control", "no-store");
    return c.json(view, 200);
  });
