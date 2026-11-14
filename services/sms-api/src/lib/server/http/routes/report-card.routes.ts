import { Hono } from "hono";

import { ReportCardService, createService } from "../../services";
import type { AppContext } from "../env";
import { currentUserId, requireAdmin } from "../middleware/authorize";
import {
  archivedMarksheetParams,
  marksheetParams,
  supersedeBody
} from "../schemas/archive";
import { jsonBody, routeParams } from "../validation";

export const reportCard = new Hono<AppContext>()
  .post("/:id/marksheets/:examTypeId/review", routeParams(marksheetParams), async (c) => {
    const { id, examTypeId } = c.req.valid("param");
    const view = await createService(ReportCardService, c.get("ctx")).review({
      studentId: id,
      examTypeId,
      actorId: currentUserId(c)
    });
    c.header("Cache-Control", "no-store");
    return c.json(view, 200);
  })
  .post(
    "/:id/marksheets/:examTypeId/publish",
    requireAdmin,
    routeParams(marksheetParams),
    async (c) => {
      const { id, examTypeId } = c.req.valid("param");
      const view = await createService(ReportCardService, c.get("ctx")).publish({
        studentId: id,
        examTypeId,
        actorId: currentUserId(c)
      });
      c.header("Cache-Control", "no-store");
      return c.json(view, 200);
    }
  )
  .post(
    "/:id/marksheets/:sessionId/:examTypeId/supersede",
    requireAdmin,
    routeParams(archivedMarksheetParams),
    jsonBody(supersedeBody),
    async (c) => {
      const { id, sessionId, examTypeId } = c.req.valid("param");
      const body = c.req.valid("json");
      const view = await createService(ReportCardService, c.get("ctx")).supersede({
        studentId: id,
        sessionId,
        examTypeId,
        reason: body.reason,
        actorId: currentUserId(c)
      });
      c.header("Cache-Control", "no-store");
      return c.json(view, 200);
    }
  );
