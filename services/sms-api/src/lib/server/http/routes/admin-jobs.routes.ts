import { Hono } from "hono";

import { JobService, createService } from "../../services";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { archiveJobParams, jobListQuery } from "../schemas/archive";
import { queryParams, routeParams } from "../validation";

export const adminJobs = new Hono<AppContext>()
  .get("/jobs", queryParams(jobListQuery), async (c) => {
    const query = c.req.valid("query");
    const jobs = await createService(JobService, c.get("ctx")).list({
      ...(query.type === undefined ? {} : { kind: query.type }),
      ...(query.status === undefined ? {} : { status: query.status })
    });
    c.header("Cache-Control", "no-store");
    return c.json({ jobs }, 200);
  })
  .post("/jobs/:id/resume", routeParams(archiveJobParams), async (c) => {
    const { id } = c.req.valid("param");
    const job = await createService(JobService, c.get("ctx")).resume(id);
    return c.json(job, 202);
  })
  .post("/jobs/:id/cancel", routeParams(archiveJobParams), async (c) => {
    const { id } = c.req.valid("param");
    const job = await createService(JobService, c.get("ctx")).cancel(id);
    return c.json(job, 200);
  })
  .post("/jobs/:id/approve", routeParams(archiveJobParams), async (c) => {
    const { id } = c.req.valid("param");
    const approval = await createService(JobService, c.get("ctx")).approve(
      id,
      currentUserId(c)
    );
    c.header("Cache-Control", "no-store");
    return c.json(approval, 200);
  });
