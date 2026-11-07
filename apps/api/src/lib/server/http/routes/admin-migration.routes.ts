import { Hono } from "hono";

import { IntegrityService, ResolutionsService, createService } from "../../services";
import type { AppContext } from "../env";
import { resolutionsQuery, sessionParams } from "../schemas/migration";
import { queryParams, routeParams } from "../validation";

export const adminMigration = new Hono<AppContext>()
  .get("/sessions/:id/integrity", routeParams(sessionParams), async (c) => {
    const { id } = c.req.valid("param");
    const report = await createService(IntegrityService, c.get("ctx")).report(id);
    c.header("Cache-Control", "no-store");
    return c.json(report, 200);
  })
  .get(
    "/sessions/:id/resolutions",
    routeParams(sessionParams),
    queryParams(resolutionsQuery),
    async (c) => {
      const query = c.req.valid("query");
      const result = await createService(ResolutionsService, c.get("ctx")).list(query);
      c.header("Cache-Control", "no-store");
      if (result.format === "csv") {
        c.header("Content-Type", "text/csv; charset=utf-8");
        return c.body(result.csv, 200);
      }
      return c.json({ resolutions: result.rows }, 200);
    }
  );
