import { Hono } from "hono";

import { RetrievalService, createService } from "../../services";
import { ValidationError } from "../../services/errors";
import { toMarksheetDto, toTranscriptDto } from "../dto/assessments-core";
import { toArchiveVersionDto } from "../dto/archive";
import type { AppContext } from "../env";
import { retrievalActor } from "../middleware/authorize";
import {
  archivedMarksheetParams,
  marksheetQuery,
  studentIdParams,
  transcriptParams
} from "../schemas/archive";
import { queryParams, routeParams } from "../validation";

export const archiveRetrieval = new Hono<AppContext>()
  .get(
    "/:id/marksheets/:sessionId/:examTypeId/versions",
    routeParams(archivedMarksheetParams),
    async (c) => {
      const { id, sessionId, examTypeId } = c.req.valid("param");
      const versions = await createService(RetrievalService, c.get("ctx")).listVersions({
        studentId: id,
        sessionId,
        examTypeId,
        actor: retrievalActor(c)
      });
      c.header("Cache-Control", "private, max-age=60");
      return c.json({ versions: versions.map(toArchiveVersionDto) }, 200);
    }
  )
  .get(
    "/:id/marksheets/:sessionId/:examTypeId",
    routeParams(archivedMarksheetParams),
    async (c) => {
      const { id, sessionId, examTypeId } = c.req.valid("param");
      const view = await createService(RetrievalService, c.get("ctx")).getArchivedMarksheet({
        studentId: id,
        sessionId,
        examTypeId,
        actor: retrievalActor(c)
      });
      if (view.etag !== null) c.header("ETag", `"${view.etag}"`);
      c.header("Cache-Control", "private, max-age=31536000, immutable");
      return c.json(toMarksheetDto(view.document), 200);
    }
  )
  .get(
    "/:id/marksheets",
    routeParams(studentIdParams),
    queryParams(marksheetQuery),
    async (c) => {
      const { id } = c.req.valid("param");
      const query = c.req.valid("query");
      if (query.examTypeId === undefined) {
        throw new ValidationError("examTypeId is required", "examTypeId");
      }
      const view = await createService(RetrievalService, c.get("ctx")).getMarksheet({
        studentId: id,
        examTypeId: query.examTypeId,
        ...(query.sessionId === undefined ? {} : { sessionId: query.sessionId }),
        actor: retrievalActor(c)
      });
      if (view.etag === null) {
        c.header("Cache-Control", "private, max-age=60");
      } else {
        c.header("ETag", `"${view.etag}"`);
        c.header("Cache-Control", "private, max-age=31536000, immutable");
      }
      return c.json(toMarksheetDto(view.document), 200);
    }
  )
  .get("/:id/transcripts/:sessionId", routeParams(transcriptParams), async (c) => {
    const { id, sessionId } = c.req.valid("param");
    const view = await createService(RetrievalService, c.get("ctx")).getTranscript({
      studentId: id,
      sessionId,
      actor: retrievalActor(c)
    });
    if (view.etag !== null) c.header("ETag", `"${view.etag}"`);
    c.header("Cache-Control", "private, max-age=60");
    return c.json(toTranscriptDto(view.document), 200);
  })
  .get("/:id/transcripts", routeParams(studentIdParams), async (c) => {
    const { id } = c.req.valid("param");
    const history = await createService(RetrievalService, c.get("ctx")).getCrossSessionTranscript({
      studentId: id,
      actor: retrievalActor(c)
    });
    c.header("Cache-Control", "private, max-age=60");
    return c.json(history, 200);
  });
