import { Hono } from "hono";

import { StaffingService, createService } from "../../services";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { sessionParams, staffingBody, staffingParams } from "../schemas/migration";
import { jsonBody, routeParams } from "../validation";

export const adminStaffing = new Hono<AppContext>()
  .get("/sessions/:id/staffing", routeParams(sessionParams), async (c) => {
    const { id } = c.req.valid("param");
    const result = await createService(StaffingService, c.get("ctx")).list(id);
    c.header("Cache-Control", "no-store");
    return c.json(result, 200);
  })
  .put(
    "/sessions/:id/classes/:classId/sections/:sectionId/staffing",
    routeParams(staffingParams),
    jsonBody(staffingBody),
    async (c) => {
      const { id, classId, sectionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await createService(StaffingService, c.get("ctx")).replace(
        id,
        classId,
        sectionId,
        body,
        currentUserId(c)
      );
      c.header("Cache-Control", "no-store");
      return c.json(result, 200);
    }
  )
  .post("/sessions/:id/staffing/accept-copied", routeParams(sessionParams), async (c) => {
    const { id } = c.req.valid("param");
    const result = await createService(StaffingService, c.get("ctx")).acceptCopied(
      id,
      currentUserId(c)
    );
    c.header("Cache-Control", "no-store");
    return c.json(result, 200);
  });
