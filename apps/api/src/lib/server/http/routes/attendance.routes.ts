import { Hono } from "hono";

import { AttendanceService, createService } from "../../services";
import type { AppContext } from "../env";
import { requireClassScope } from "../middleware/tenant";
import { attendanceBody } from "../schemas/attendance";
import { jsonBody } from "../validation";

export const attendance = new Hono<AppContext>().put(
  "/",
  requireClassScope,
  jsonBody(attendanceBody),
  async (c) => {
    const body = c.req.valid("json");
    const attendanceId = await createService(
      AttendanceService,
      c.get("ctx")
    ).upsertAttendance(body);
    return c.json({ attendanceId }, 200);
  }
);
