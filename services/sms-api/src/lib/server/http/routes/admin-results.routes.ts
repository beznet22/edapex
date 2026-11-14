import { Hono } from "hono";

import { ReportCardService, createService } from "../../services";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { overrideBody, resultParams } from "../schemas/archive";
import { jsonBody, routeParams } from "../validation";

export const adminResults = new Hono<AppContext>().post(
  "/results/:id/override",
  routeParams(resultParams),
  jsonBody(overrideBody),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const view = await createService(ReportCardService, c.get("ctx")).overrideResult({
      resultId: id,
      reason: body.reason,
      ...(body.totalMarks === undefined ? {} : { totalMarks: body.totalMarks }),
      ...(body.isAbsent === undefined ? {} : { isAbsent: body.isAbsent }),
      ...(body.teacherRemarks === undefined ? {} : { teacherRemarks: body.teacherRemarks }),
      actorId: currentUserId(c)
    });
    c.header("Cache-Control", "no-store");
    return c.json(view, 200);
  }
);
