import { Hono } from "hono";

import { RetrievalService, createService } from "../../services";
import {
  toHistoryRenderPayload,
  toMarksheetRenderPayload,
  toTranscriptRenderPayload
} from "../dto/archive";
import type { AppContext } from "../env";
import { retrievalActor } from "../middleware/authorize";
import {
  archivedMarksheetParams,
  marksheetParams,
  studentIdParams,
  transcriptParams
} from "../schemas/archive";
import { routeParams } from "../validation";

export const archiveRender = new Hono<AppContext>()
  .post(
    "/:id/marksheets/:examTypeId/pdf",
    routeParams(marksheetParams),
    async (c) => {
      const { id, examTypeId } = c.req.valid("param");
      const view = await createService(RetrievalService, c.get("ctx")).getMarksheet({
        studentId: id,
        examTypeId,
        actor: retrievalActor(c)
      });
      return c.json(
        toMarksheetRenderPayload(view, `marksheet-${id}-${examTypeId}-v${view.version}.pdf`),
        200
      );
    }
  )
  .post(
    "/:id/marksheets/:sessionId/:examTypeId/pdf",
    routeParams(archivedMarksheetParams),
    async (c) => {
      const { id, sessionId, examTypeId } = c.req.valid("param");
      const view = await createService(RetrievalService, c.get("ctx")).getArchivedMarksheet({
        studentId: id,
        sessionId,
        examTypeId,
        actor: retrievalActor(c)
      });
      return c.json(
        toMarksheetRenderPayload(
          view,
          `marksheet-${id}-${sessionId}-${examTypeId}-v${view.version}.pdf`
        ),
        200
      );
    }
  )
  .post("/:id/transcripts/:sessionId/pdf", routeParams(transcriptParams), async (c) => {
    const { id, sessionId } = c.req.valid("param");
    const view = await createService(RetrievalService, c.get("ctx")).getTranscript({
      studentId: id,
      sessionId,
      actor: retrievalActor(c)
    });
    return c.json(
      toTranscriptRenderPayload(view, `transcript-${id}-${sessionId}-v${view.version}.pdf`),
      200
    );
  })
  .post("/:id/transcripts/pdf", routeParams(studentIdParams), async (c) => {
    const { id } = c.req.valid("param");
    const history = await createService(RetrievalService, c.get("ctx")).getCrossSessionTranscript({
      studentId: id,
      actor: retrievalActor(c)
    });
    return c.json(toHistoryRenderPayload(history, `transcript-${id}-history.pdf`), 200);
  });
