import { Hono } from "hono";

import { StudentCodeService, createService } from "../../services";
import { toIssuedCodeCsv, toIssuedCodeDto } from "../dto/admin";
import type { AppContext } from "../env";
import { currentUserId } from "../middleware/authorize";
import { issueCodesBody, studentIdParams } from "../schemas/admin";
import { jsonBody, routeParams } from "../validation";

export const adminStudentCodes = new Hono<AppContext>()
  .post("/student-codes/issue", jsonBody(issueCodesBody), async (c) => {
    const body = c.req.valid("json");
    const rows = await createService(StudentCodeService, c.get("ctx")).issue({
      studentIds: body.studentIds,
      actorUserId: currentUserId(c)
    });
    c.header("Cache-Control", "no-store");

    if (c.get("wantsCsv") || body.format === "csv") {
      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header("Content-Disposition", 'attachment; filename="student-codes.csv"');
      return c.body(toIssuedCodeCsv(rows), 200);
    }
    return c.json({ codes: rows.map(toIssuedCodeDto) }, 200);
  })
  .post("/student-codes/:studentId/reissue", routeParams(studentIdParams), async (c) => {
    const { studentId } = c.req.valid("param");
    const row = await createService(StudentCodeService, c.get("ctx")).reissue(
      studentId,
      currentUserId(c)
    );
    c.header("Cache-Control", "no-store");
    return c.json({ code: toIssuedCodeDto(row) }, 200);
  })
  .delete("/student-codes/:studentId", routeParams(studentIdParams), async (c) => {
    const { studentId } = c.req.valid("param");
    await createService(StudentCodeService, c.get("ctx")).revoke(
      studentId,
      currentUserId(c)
    );
    return c.body(null, 204);
  });
