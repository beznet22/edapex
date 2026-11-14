import { Hono } from "hono";

import { createService } from "../../services";
import { AssessmentOcrService } from "../../services/assessment";
import { toExtractionDto } from "../dto/assessments-media";
import type { AppContext } from "../env";
import { requireAdmin, requireStaff } from "../middleware/authorize";
import { localOcrBody, ocrForm } from "../schemas/assessments-media";
import { formBody, jsonBody } from "../validation";

export const assessmentOcr = new Hono<AppContext>()
  .post("/ocr/extractions", formBody(ocrForm), async (c) => {
    if (c.req.header("x-ocr-consent") !== "cloud") {
      return c.json(
        {
          error: "VALIDATION_FAILED",
          message: "Cloud OCR requires explicit consent",
          requestId: c.get("requestId") ?? ""
        },
        400
      );
    }
    const { file, filename } = c.req.valid("form");
    const result = await createService(
      AssessmentOcrService,
      c.get("ctx")
    ).runExtraction({ file, fileName: filename ?? file.name });
    return c.json(toExtractionDto(result), 200);
  })
  .post(
    "/ocr/local-extractions",
    requireStaff,
    jsonBody(localOcrBody),
    async (c) => {
      const result = await createService(
        AssessmentOcrService,
        c.get("ctx")
      ).runLocalExtraction(c.req.valid("json"));
      c.header("Cache-Control", "no-store");
      return c.json(toExtractionDto(result), 200);
    }
  )
  .delete("/ocr/cache", requireAdmin, async (c) => {
    const purged = await createService(
      AssessmentOcrService,
      c.get("ctx")
    ).purgeExpired();
    return c.json({ purged }, 200);
  });
