import { Hono } from "hono";

import { createService, StudentGuardianService, StudentProfileService } from "../../services";
import type { AppContext } from "../env";
import { requireClassScope } from "../middleware/tenant";
import {
  attachGuardianBody,
  studentIdParams,
  studentStatusBody,
  studentUpdateBody
} from "../schemas/students";
import { jsonBody, routeParams } from "../validation";

/**
 * Reading and editing one student.
 *
 * `requireClassScope`, like the list and status routes: a teacher may only reach a student in
 * a section they teach, and `TenantScopeService` is what proves that (the header alone proves
 * nothing).
 *
 * There is no `DELETE`. Marks, attendance, fees and archived report cards reference the id;
 * removal is `PATCH /:id/status` with `active: false`, which updates the student and every
 * placement record in one batch.
 *
 * Placement is not editable here on purpose — see `studentUpdateBody`.
 */
export const studentProfiles = new Hono<AppContext>()
  .get("/:studentId", requireClassScope, routeParams(studentIdParams), async (c) => {
    const { studentId } = c.req.valid("param");
    const student = await createService(StudentProfileService, c.get("ctx")).get(studentId);
    c.header("Cache-Control", "no-store");
    return c.json(student, 200);
  })
  .patch(
    "/:studentId",
    requireClassScope,
    routeParams(studentIdParams),
    jsonBody(studentUpdateBody),
    async (c) => {
      const { studentId } = c.req.valid("param");
      const body = c.req.valid("json");
      const student = await createService(StudentProfileService, c.get("ctx")).update(
        studentId,
        body
      );
      c.header("Cache-Control", "no-store");
      return c.json(student, 200);
    }
  )
  .patch(
    "/:studentId/active",
    requireClassScope,
    routeParams(studentIdParams),
    jsonBody(studentStatusBody),
    async (c) => {
      // The existing `/status` route on `students.routes.ts` already does this; this alias
      // keeps the CRUD surface addressable from one module without changing that contract.
      const { studentId } = c.req.valid("param");
      const { active } = c.req.valid("json");
      const student = await createService(StudentProfileService, c.get("ctx")).setActive(
        studentId,
        active
      );
      c.header("Cache-Control", "no-store");
      return c.json(student, 200);
    }
  )
  .put(
    "/:studentId/guardian",
    requireClassScope,
    routeParams(studentIdParams),
    jsonBody(attachGuardianBody),
    async (c) => {
      const { studentId } = c.req.valid("param");
      const body = c.req.valid("json");
      const guardian = await createService(StudentGuardianService, c.get("ctx")).attach({
        studentId,
        ...(body.parentId === undefined ? {} : { parentId: body.parentId }),
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.email === undefined ? {} : { email: body.email }),
        ...(body.mobile === undefined ? {} : { mobile: body.mobile }),
        ...(body.relation === undefined ? {} : { relation: body.relation })
      });
      c.header("Cache-Control", "no-store");
      return c.json(guardian, 200);
    }
  )
  .delete("/:studentId/guardian", requireClassScope, routeParams(studentIdParams), async (c) => {
    const { studentId } = c.req.valid("param");
    await createService(StudentGuardianService, c.get("ctx")).detach(studentId);
    return c.body(null, 204);
  });
