import { Hono } from "hono";

import { ArchiveService, RestoreService, createService } from "../../services";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { archiveBody, archiveSessionParams, restoreBody } from "../schemas/archive";
import { jsonBody, routeParams } from "../validation";

export const adminSessions = new Hono<AppContext>()
  .post(
    "/sessions/:id/archive",
    routeParams(archiveSessionParams),
    jsonBody(archiveBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await createService(ArchiveService, c.get("ctx")).start({
        sessionId: id,
        purge: body.purge ?? false,
        dryRun: body.dryRun ?? false,
        actorId: currentUserId(c)
      });
      c.header("Cache-Control", "no-store");
      return c.json(result, "dryRun" in result ? 200 : 202);
    }
  )
  .get("/sessions/:id/archive/status", routeParams(archiveSessionParams), async (c) => {
    const { id } = c.req.valid("param");
    const result = await createService(ArchiveService, c.get("ctx")).status(id);
    c.header("Cache-Control", "no-store");
    return c.json(result, 200);
  })
  .get("/sessions/:id/archive/manifest", routeParams(archiveSessionParams), async (c) => {
    const { id } = c.req.valid("param");
    const result = await createService(ArchiveService, c.get("ctx")).manifest(id);
    c.header("ETag", `"${result.generatedAt}"`);
    c.header("Cache-Control", "private, max-age=60");
    return c.json(result, 200);
  })
  .post(
    "/sessions/:id/restore",
    routeParams(archiveSessionParams),
    jsonBody(restoreBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await createService(RestoreService, c.get("ctx")).start({
        sessionId: id,
        dryRun: body.dryRun ?? false,
        actorId: currentUserId(c)
      });
      c.header("Cache-Control", "no-store");
      return c.json(result, "dryRun" in result ? 200 : 202);
    }
  );
