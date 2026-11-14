import { Hono } from "hono";

import { BootstrapService, createService } from "../../services";
import { ConflictError } from "../../services/errors";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { bootstrapBody, bootstrapJobParams } from "../schemas/migration";
import { jsonBody, routeParams } from "../validation";

export const adminBootstrap = new Hono<AppContext>()
  .post("/sessions/bootstrap", jsonBody(bootstrapBody), async (c) => {
    const body = c.req.valid("json");
    const result = await createService(BootstrapService, c.get("ctx")).start(
      body,
      currentUserId(c)
    );
    c.header("Cache-Control", "no-store");
    if ("dryRun" in result) return c.json(result, 200);
    if (result.status === "failed") {
      throw new ConflictError(result.error ?? "Bootstrap failed");
    }
    return c.json(result, 202);
  })
  .get("/sessions/bootstrap/:jobId", routeParams(bootstrapJobParams), async (c) => {
    const { jobId } = c.req.valid("param");
    const job = await createService(BootstrapService, c.get("ctx")).status(jobId);
    c.header("Cache-Control", "no-store");
    return c.json(job, 200);
  });
