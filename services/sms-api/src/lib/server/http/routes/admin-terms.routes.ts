import { Hono } from "hono";

import { TermsService, createService } from "../../services";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { sessionParams, termsBody } from "../schemas/migration";
import { jsonBody, routeParams } from "../validation";

export const adminTerms = new Hono<AppContext>().post(
  "/sessions/:id/terms",
  routeParams(sessionParams),
  jsonBody(termsBody),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await createService(TermsService, c.get("ctx")).createOrUpdate(
      id,
      body,
      currentUserId(c)
    );
    c.header("Cache-Control", "no-store");
    return c.json(result, 200);
  }
);
