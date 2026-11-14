import { Hono } from "hono";

import { createService } from "../../services";
import { AssessmentPublishService } from "../../services/assessment";
import {
  toPublishResultsDto,
  toPublishTranscriptDto
} from "../dto/assessments-core";
import type { AppContext } from "../env";
import { requireAdmin } from "../middleware/authorize";
import { requireClassScope } from "../middleware/tenant";
import {
  publishResultsBody,
  publishTranscriptBody
} from "../schemas/assessments-core";
import { jsonBody } from "../validation";

export const assessmentPublish = new Hono<AppContext>()
  .post(
    "/results",
    requireClassScope,
    jsonBody(publishResultsBody),
    async (c) => {
      const body = c.req.valid("json");
      const result = await createService(
        AssessmentPublishService,
        c.get("ctx")
      ).publishResults({
        examId: body.examId,
        studentIds: body.studentIds,
        ...(body.resend === undefined ? {} : { resend: body.resend })
      });
      return c.json(toPublishResultsDto(result), 200);
    }
  )
  .post(
    "/transcript",
    requireAdmin,
    jsonBody(publishTranscriptBody),
    async (c) => {
      const body = c.req.valid("json");
      const result = await createService(
        AssessmentPublishService,
        c.get("ctx")
      ).publishTranscript({
        to: body.to,
        parentName: body.parentName,
        studentName: body.studentName,
        academicYear: body.academicYear,
        ...(body.html === undefined ? {} : { html: body.html }),
        ...(body.pdfFilename === undefined
          ? {}
          : { pdfFilename: body.pdfFilename })
      });
      return c.json(toPublishTranscriptDto(result), 200);
    }
  );
