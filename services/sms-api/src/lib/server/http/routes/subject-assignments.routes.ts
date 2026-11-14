import { Hono } from "hono";

import { createService, SubjectAssignmentService } from "../../services";
import { AuthError } from "../../services/errors";
import type { AppContext } from "../env";
import { requireAdmin } from "../middleware/authorize";
import { requireClassScope } from "../middleware/tenant";
import { subjectAssignmentsBody } from "../schemas/subject-assignments";
import { jsonBody } from "../validation";

export const subjectAssignments = new Hono<AppContext>().post(
  "/assignments",
  requireAdmin,
  requireClassScope,
  jsonBody(subjectAssignmentsBody),
  async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const { assignments } = c.req.valid("json");
    const result = await createService(
      SubjectAssignmentService,
      c.get("ctx")
    ).assign({ assignments, createdBy: user.id });
    return c.json({ assigned: result.assigned }, 200);
  }
);
