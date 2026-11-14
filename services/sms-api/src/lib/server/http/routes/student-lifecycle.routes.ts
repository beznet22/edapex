import { Hono } from "hono";
import type { Context } from "hono";

import { createService } from "../../services";
import { PermissionError } from "../../services/errors";
import { StudentLifecycleService } from "../../services/students";
import { toDemotionDto, toPromotionDto } from "../dto/students";
import type { AppContext } from "../env";
import { requireAdmin, requireStaff } from "../middleware/authorize";
import { demotionBody, promotionBody, studentIdParams } from "../schemas/students";
import { jsonBody, routeParams } from "../validation";

const staffIdOf = (c: Context<AppContext>): number => {
  const user = c.get("user");
  if (user === null || user.staffId === null) {
    throw new PermissionError("A staff account is required");
  }
  return user.staffId;
};

export const studentLifecycle = new Hono<AppContext>()
  .post(
    "/:studentId/promotions",
    requireAdmin,
    requireStaff,
    routeParams(studentIdParams),
    jsonBody(promotionBody),
    async (c) => {
      const { studentId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await createService(
        StudentLifecycleService,
        c.get("ctx")
      ).promoteStudent(
        {
          studentId,
          classId: body.classId,
          sectionId: body.sectionId,
          ...(body.targetAcademicId === undefined
            ? {}
            : { targetAcademicId: body.targetAcademicId }),
          ...(body.rollNo === undefined ? {} : { rollNo: body.rollNo }),
          ...(body.resultStatus === undefined
            ? {}
            : { resultStatus: body.resultStatus })
        },
        staffIdOf(c)
      );
      return c.json(toPromotionDto(result), 200);
    }
  )
  .post(
    "/:studentId/demotions",
    requireAdmin,
    requireStaff,
    routeParams(studentIdParams),
    jsonBody(demotionBody),
    async (c) => {
      const { studentId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await createService(
        StudentLifecycleService,
        c.get("ctx")
      ).demoteStudent({
        studentId,
        ...(body.promotionId === undefined
          ? {}
          : { promotionId: body.promotionId })
      });
      return c.json(toDemotionDto(result), 200);
    }
  );
