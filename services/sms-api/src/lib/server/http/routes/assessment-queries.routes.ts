import { Hono } from "hono";

import { createService } from "../../services";
import { AssessmentQueryService } from "../../services/assessment";
import { NotFoundError, ValidationError } from "../../services/errors";
import {
  toMarksheetDto,
  toTranscriptDto
} from "../dto/assessments-core";
import type { AppContext } from "../env";
import { requireClassScope } from "../middleware/tenant";
import {
  resultParams,
  resultQuery,
  transcriptParams,
  transcriptQuery
} from "../schemas/assessments-core";
import { queryParams, routeParams } from "../validation";

export const assessmentQueries = new Hono<AppContext>()
  .get(
    "/results/:identifier/:examId",
    requireClassScope,
    routeParams(resultParams),
    queryParams(resultQuery),
    async (c) => {
      const { identifier, examId } = c.req.valid("param");
      const { byAdmission, withImages } = c.req.valid("query");
      const id = Number(identifier);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ValidationError("A positive identifier is required", "identifier");
      }
      const result = await createService(
        AssessmentQueryService,
        c.get("ctx")
      ).getStudentResult({
        id,
        examId,
        isAdminNo: byAdmission,
        withImages
      });
      if (result === null) {
        throw new NotFoundError("Result", `${identifier}/${examId}`);
      }
      c.header("Cache-Control", "private, max-age=60");
      return c.json(toMarksheetDto(result), 200);
    }
  )
  .get(
    "/transcripts/:studentId/:academicId",
    routeParams(transcriptParams),
    queryParams(transcriptQuery),
    async (c) => {
      const { studentId, academicId } = c.req.valid("param");
      const { withImages } = c.req.valid("query");
      const result = await createService(
        AssessmentQueryService,
        c.get("ctx")
      ).getTranscript({ studentId, academicId, withImages });
      if (result === null) {
        throw new NotFoundError("Transcript", `${studentId}/${academicId}`);
      }
      c.header("Cache-Control", "private, max-age=60");
      return c.json(toTranscriptDto(result), 200);
    }
  );
