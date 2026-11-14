import { Hono } from "hono";

import {
  adminIssueApplySchema,
  adminIssueIdParamsSchema,
  adminIssueQuerySchema,
  type AdminIssueApplyBody,
  type AdminIssueIdParams,
  type AdminIssueQuery
} from "@edapex/contracts/issues";

import { AdminIssueService, createService } from "../../services";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { jsonBody, queryParams, routeParams } from "../validation";

export const adminIssues = new Hono<AppContext>()
  .get("/issues", queryParams<AdminIssueQuery>(adminIssueQuerySchema), async (c) => {
    const page = await createService(
      AdminIssueService,
      c.get("ctx")
    ).list(c.req.valid("query"));
    c.header("Cache-Control", "no-store");
    return c.json(page, 200);
  })
  .get("/issues/:id", routeParams<AdminIssueIdParams>(adminIssueIdParamsSchema), async (c) => {
    const issue = await createService(
      AdminIssueService,
      c.get("ctx")
    ).get(c.req.valid("param").id);
    c.header("Cache-Control", "no-store");
    return c.json(issue, 200);
  })
  .post("/issues/:id/plan", routeParams<AdminIssueIdParams>(adminIssueIdParamsSchema), async (c) => {
    const plan = await createService(
      AdminIssueService,
      c.get("ctx")
    ).plan(c.req.valid("param").id);
    c.header("Cache-Control", "no-store");
    return c.json(plan, 200);
  })
  .post(
    "/issues/:id/apply",
    routeParams<AdminIssueIdParams>(adminIssueIdParamsSchema),
    jsonBody<AdminIssueApplyBody>(adminIssueApplySchema),
    async (c) => {
      const body = c.req.valid("json");
      const result = await createService(AdminIssueService, c.get("ctx")).apply(
        c.req.valid("param").id,
        {
          actionId: body.actionId,
          confirm: body.confirm,
          ...(body.ttlHours === undefined ? {} : { ttlHours: body.ttlHours })
        },
        currentUserId(c)
      );
      c.header("Cache-Control", "no-store");
      return c.json(result, 200);
    }
  );
