import { Hono } from "hono";
import { z } from "zod";

import { AuthError } from "../../services/errors";
import { createService } from "../../services";
import { PublishApprovalService } from "../../services/assessment/publish-approval.service";
import type { AppContext } from "../env";
import { jsonBody } from "../validation";

const decideBody = z.object({
  decision: z.enum(["approved", "denied"]),
  note: z.string().max(300).optional()
});

/**
 * The admin side of the publish gate.
 *
 * `requireAdmin` is applied by the `/admin/*` mount, not here: one place decides
 * who is an admin, and a route that re-checked it would be a second answer.
 */
export const adminPublishApprovals = new Hono<AppContext>()
  .get("/publish-approvals", async (c) => {
    const pending = await createService(PublishApprovalService, c.get("ctx")).pending();
    c.header("Cache-Control", "no-store");
    return c.json({
      approvals: pending.map((row) => ({
        id: row.id,
        examId: row.examId,
        requestedBy: row.requestedBy,
        studentIds: JSON.parse(row.studentIdsJson) as number[],
        status: row.status
      }))
    });
  })
  .post("/publish-approvals/:id/decide", jsonBody(decideBody), async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const result = await createService(PublishApprovalService, c.get("ctx")).decide({
      id: Number.isInteger(id) ? id : -1,
      decision: body.decision,
      note: body.note ?? null
    });
    // Close the loop: the person who asked learns the answer even if they closed
    // the app, because a denial they never see looks like the request vanished.
    const queue = c.env.PUSH_QUEUE;
    if (queue !== undefined && result.requestedBy !== null && user.schoolId !== null) {
      await queue.send({
        id: `publish-approval-${id}-${result.decision}`,
        kind: "approval.decided",
        schoolId: String(user.schoolId),
        actorUserId: String(user.id),
        audience: { role: "teacher", userIds: [String(result.requestedBy)] },
        title: result.decision === "approved" ? "Results published" : "Publish request denied",
        body:
          result.decision === "approved"
            ? `${result.published} result${result.published === 1 ? "" : "s"} were published.`
            : "An admin declined the request. Open it to read the note.",
        route: `/approval/${id}`,
        params: { subjectId: String(id) }
      });
    }
    c.header("Cache-Control", "no-store");
    return c.json(result, 200);
  });
