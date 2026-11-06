import { Hono } from "hono";

import { DuplicateEmailService, createService } from "../../services";
import { toDuplicateGroupDto } from "../dto/admin";
import type { AppContext } from "../env";

export const adminDuplicateEmails = new Hono<AppContext>()
  .get("/duplicate-emails", async (c) => {
    const groups = await createService(DuplicateEmailService, c.get("ctx")).list();
    c.header("Cache-Control", "no-store");
    return c.json({ groups: groups.map(toDuplicateGroupDto) }, 200);
  })
  .get("/duplicate-emails/export", async (c) => {
    const csv = await createService(DuplicateEmailService, c.get("ctx")).exportCsv();
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="duplicate-emails.csv"');
    c.header("Cache-Control", "no-store");
    return c.body(csv, 200);
  });
