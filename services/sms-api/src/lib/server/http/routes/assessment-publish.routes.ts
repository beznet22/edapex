import { Hono } from "hono";

import { createService } from "../../services";
import { AssessmentPublishService } from "../../services/assessment";
import {
  toPublishResultsDto,
  toPublishTranscriptDto
} from "../dto/assessments-core";
import type { AppContext } from "../env";
import { requireAdmin } from "../middleware/authorize";
import { AuthError } from "../../services/errors";
import { requireClassScope } from "../middleware/tenant";
import { z } from "zod";
import { PublishApprovalService } from "../../services/assessment/publish-approval.service";
import {
  publishResultsBody,
  publishTranscriptBody
} from "../schemas/assessments-core";
import { jsonBody } from "../validation";

const publishRequest = z.object({
  examId: z.number().int().positive(),
  studentIds: z.array(z.number().int().positive()).min(1),
  note: z.string().max(300).optional()
});

export const assessmentPublish = new Hono<AppContext>()
  /*
   * A publish that a teacher may not perform alone.
   *
   * The request is stored and the admins are notified; nothing is sent to a
   * parent until an admin approves. The direct `/results` route above stays as it
   * is for an admin, and both end up in the same publish service.
   */
  .post("/requests", requireClassScope, jsonBody(publishRequest), async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const body = c.req.valid("json");
    const approval = await createService(
      PublishApprovalService,
      c.get("ctx")
    ).request({
      examId: body.examId,
      studentIds: body.studentIds,
      note: body.note ?? null
    });

    const queue = c.env.PUSH_QUEUE;
    if (queue !== undefined && user.schoolId !== null) {
      await queue.send({
        id: `publish-approval-${approval.id}`,
        kind: "approval.requested",
        schoolId: String(user.schoolId),
        actorUserId: String(user.id),
        audience: { role: "admin" },
        title: "Results need your approval",
        body: `${body.studentIds.length} student${body.studentIds.length === 1 ? "" : "s"} are waiting to have results published.`,
        route: `/approval/${approval.id}`,
        params: { subjectId: String(approval.id) }
      });
    }
    c.header("Cache-Control", "no-store");
    return c.json({ approvalId: approval.id }, 202);
  })
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
