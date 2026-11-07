import { Hono } from "hono";

import { PromotionService, createService } from "../../services";
import { ConflictError } from "../../services/errors";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { sessionParams } from "../schemas/migration";
import {
  promotionBatchParams,
  promotionBody,
  promotionParams,
  reverseBody
} from "../schemas/promotion";
import { jsonBody, routeParams } from "../validation";

export const adminPromotion = new Hono<AppContext>()
  .post(
    "/sessions/:id/promote",
    routeParams(sessionParams),
    jsonBody(promotionBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await createService(PromotionService, c.get("ctx")).start(
        id,
        body,
        currentUserId(c)
      );
      c.header("Cache-Control", "no-store");
      if ("dryRun" in result) return c.json(result, 200);
      if (result.status === "failed") {
        throw new ConflictError(result.error ?? "Promotion failed");
      }
      return c.json(result, 202);
    }
  )
  .get("/sessions/:id/promotion/quarantine.csv", routeParams(sessionParams), async (c) => {
    const { id } = c.req.valid("param");
    const csv = await createService(PromotionService, c.get("ctx")).quarantineCsv(id);
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Cache-Control", "no-store");
    return c.body(csv, 200);
  })
  .get("/sessions/:id/promotion/quarantine.pdf", routeParams(sessionParams), async (c) => {
    const { id } = c.req.valid("param");
    const document = await createService(PromotionService, c.get("ctx")).quarantinePdf(id);
    c.header("Cache-Control", "no-store");
    return c.json(document, 200);
  })
  .get("/sessions/:id/promotion/:jobId", routeParams(promotionParams), async (c) => {
    const { jobId } = c.req.valid("param");
    const job = await createService(PromotionService, c.get("ctx")).status(jobId);
    c.header("Cache-Control", "no-store");
    return c.json(job, 200);
  })
  .post(
    "/promotion/batches/:batchId/reverse",
    routeParams(promotionBatchParams),
    jsonBody(reverseBody),
    async (c) => {
      const { batchId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await createService(PromotionService, c.get("ctx")).reverse(
        batchId,
        body,
        currentUserId(c)
      );
      c.header("Cache-Control", "no-store");
      return c.json(result, 200);
    }
  );
