import { Hono } from "hono";

import { createService } from "../../services";
import { NotFoundError } from "../../services/errors";
import { GeneralSettingsService } from "../../services/settings";
import { toGeneralSettingsDto } from "../dto/settings";
import type { AppContext } from "../env";
import { requireAdmin } from "../middleware/authorize";
import { generalSettingsPatch } from "../schemas/settings";
import { jsonBody } from "../validation";

export const settingsGeneral = new Hono<AppContext>()
  .get("/general", requireAdmin, async (c) => {
    const settings = await createService(
      GeneralSettingsService,
      c.get("ctx")
    ).getGeneralSettings();
    if (settings === null) {
      throw new NotFoundError(
        "General settings",
        c.get("tenant")?.schoolId ?? 0
      );
    }
    c.header("Cache-Control", "private, max-age=60");
    return c.json({ settings: toGeneralSettingsDto(settings) }, 200);
  })
  .patch(
    "/general",
    requireAdmin,
    jsonBody(generalSettingsPatch),
    async (c) => {
      const settings = await createService(
        GeneralSettingsService,
        c.get("ctx")
      ).saveGeneralSettings(c.req.valid("json"));
      if (settings === null) {
        throw new NotFoundError(
          "General settings",
          c.get("tenant")?.schoolId ?? 0
        );
      }
      return c.json({ settings: toGeneralSettingsDto(settings) }, 200);
    }
  );
