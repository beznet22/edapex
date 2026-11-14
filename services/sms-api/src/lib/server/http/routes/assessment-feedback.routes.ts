import { Hono } from "hono";

import { createService } from "../../services";
import { AssessmentFeedbackService } from "../../services/assessment";
import type { AppContext } from "../env";
import { requireStaff, staffIdOf } from "../middleware/authorize";
import { requireClassScope } from "../middleware/tenant";
import {
  feedbackRatingsBody,
  feedbackRemarkBody
} from "../schemas/assessments-media";
import { jsonBody } from "../validation";

export const assessmentFeedback = new Hono<AppContext>()
  .put(
    "/feedback/remarks",
    requireStaff,
    requireClassScope,
    jsonBody(feedbackRemarkBody),
    async (c) => {
      const body = c.req.valid("json");
      await createService(
        AssessmentFeedbackService,
        c.get("ctx")
      ).upsertTeacherRemark({
        studentId: body.studentId,
        examTypeId: body.examTypeId,
        remark: body.remark,
        teacherId: staffIdOf(c)
      });
      return c.body(null, 204);
    }
  )
  .put(
    "/feedback/ratings",
    requireClassScope,
    jsonBody(feedbackRatingsBody),
    async (c) => {
      const body = c.req.valid("json");
      await createService(
        AssessmentFeedbackService,
        c.get("ctx")
      ).upsertStudentRatings({
        studentId: body.studentId,
        examTypeId: body.examTypeId,
        ratings: body.ratings
      });
      return c.body(null, 204);
    }
  );
