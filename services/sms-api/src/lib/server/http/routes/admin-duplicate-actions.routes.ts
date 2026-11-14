import { Hono } from "hono";

import { DuplicateEmailService, createService } from "../../services";
import type { AppContext } from "../env";
import {
  flagAccountBody,
  mergeEmailBody,
  reassignEmailBody
} from "../schemas/admin";
import { jsonBody } from "../validation";

export const adminDuplicateActions = new Hono<AppContext>()
  .post("/duplicate-emails/reassign", jsonBody(reassignEmailBody), async (c) => {
    const body = c.req.valid("json");
    await createService(DuplicateEmailService, c.get("ctx")).reassign({
      email: body.email,
      targetUserId: body.targetUserId
    });
    return c.body(null, 204);
  })
  .post("/duplicate-emails/merge", jsonBody(mergeEmailBody), async (c) => {
    const body = c.req.valid("json");
    await createService(DuplicateEmailService, c.get("ctx")).merge({
      email: body.email,
      keepUserId: body.keepUserId,
      mergeUserIds: body.mergeUserIds
    });
    return c.body(null, 204);
  })
  .post("/duplicate-emails/flag", jsonBody(flagAccountBody), async (c) => {
    const body = c.req.valid("json");
    await createService(DuplicateEmailService, c.get("ctx")).flag(body.userId);
    return c.body(null, 204);
  });
