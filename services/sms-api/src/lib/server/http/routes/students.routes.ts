import { Hono } from "hono";

import { createService } from "../../services";
import {
  StudentLifecycleService,
  StudentSearchService
} from "../../services/students";
import { listDto } from "../dto/common";
import {
  toStudentStatusDto,
  toStudentSummaryDto
} from "../dto/students";
import type { AppContext } from "../env";
import { requireClassScope } from "../middleware/tenant";
import { studentIdParams, studentListQuery, studentStatusBody } from "../schemas/students";
import { jsonBody, queryParams, routeParams } from "../validation";

export const students = new Hono<AppContext>()
  .get(
    "/",
    requireClassScope,
    queryParams(studentListQuery),
    async (c) => {
      const query = c.req.valid("query");
      const result = await createService(
        StudentSearchService,
        c.get("ctx")
      ).search({
        ...(query.q === undefined ? {} : { query: query.q }),
        limit: query.limit
      });
      return c.json(listDto(result.rows.map(toStudentSummaryDto)), 200);
    }
  )
  .patch(
    "/:studentId/status",
    requireClassScope,
    routeParams(studentIdParams),
    jsonBody(studentStatusBody),
    async (c) => {
      const { studentId } = c.req.valid("param");
      const { active } = c.req.valid("json");
      const result = await createService(
        StudentLifecycleService,
        c.get("ctx")
      ).setActiveStatus(studentId, active);
      return c.json(toStudentStatusDto(result), 200);
    }
  );
