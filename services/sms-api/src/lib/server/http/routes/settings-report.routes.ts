import { Hono } from "hono";

import { createService } from "../../services";
import { AuthError } from "../../services/errors";
import { ReportSettingsService } from "../../services/settings";
import { toReportSettingsDto } from "../dto/settings";
import type { AppContext } from "../env";
import { requireAdmin } from "../middleware/authorize";
import { reportSettingsPatch } from "../schemas/settings";
import { jsonBody } from "../validation";

export const settingsReport = new Hono<AppContext>()
  .get("/report-templates", requireAdmin, async (c) => {
    const settings = await createService(
      ReportSettingsService,
      c.get("ctx")
    ).getReportSettings();
    c.header("Cache-Control", "private, max-age=60");
    return c.json({ settings: toReportSettingsDto(settings) }, 200);
  })
  .patch(
    "/report-templates",
    requireAdmin,
    jsonBody(reportSettingsPatch),
    async (c) => {
      const user = c.get("user");
      if (user === null) throw new AuthError();
      const settings = await createService(
        ReportSettingsService,
        c.get("ctx")
      ).saveReportSettings(c.req.valid("json"), user.staffId ?? user.id);
      return c.json({ settings: toReportSettingsDto(settings) }, 200);
    }
  );
