import { Hono } from "hono";

import { createService } from "../../services";
import { AssessmentOcrService } from "../../services/assessment";
import { toExtractionDto } from "../dto/assessments-media";
import type { AppContext } from "../env";
import { requireAdmin } from "../middleware/authorize";
import { ocrForm } from "../schemas/assessments-media";
import { formBody } from "../validation";

export const assessmentOcr = new Hono<AppContext>()
  .post("/ocr/extractions", formBody(ocrForm), async (c) => {
    const { file, filename } = c.req.valid("form");
    const result = await createService(
      AssessmentOcrService,
      c.get("ctx")
    ).runExtraction({ file, fileName: filename ?? file.name });
    return c.json(toExtractionDto(result), 200);
  })
  .delete("/ocr/cache", requireAdmin, async (c) => {
    const purged = await createService(
      AssessmentOcrService,
      c.get("ctx")
    ).purgeExpired();
    return c.json({ purged }, 200);
  });
