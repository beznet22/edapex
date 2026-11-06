import { Hono } from "hono";
import type { Context } from "hono";

import { createService } from "../../services";
import { MarksheetCaptureService } from "../../services/assessment";
import { AuthError, TenantScopeError } from "../../services/errors";
import {
  toCaptureDto,
  toCaptureResultDto
} from "../dto/assessments-media";
import type { AppContext } from "../env";
import { requireStaff } from "../middleware/authorize";
import { requireClassScope } from "../middleware/tenant";
import {
  captureConfirmBody,
  captureForm,
  captureIdParams
} from "../schemas/assessments-media";
import { formBody, jsonBody, routeParams } from "../validation";

interface CaptureScope {
  readonly classId: number;
  readonly sectionId: number;
  readonly academicId: number;
}

const captureScopeOf = (c: Context<AppContext>): CaptureScope => {
  const tenant = c.get("tenant");
  if (
    tenant === null ||
    tenant.classId === null ||
    tenant.sectionId === null ||
    tenant.academicId === null
  ) {
    throw new TenantScopeError("Class and section are required for captures");
  }
  return {
    classId: tenant.classId,
    sectionId: tenant.sectionId,
    academicId: tenant.academicId
  };
};

export const assessmentCaptures = new Hono<AppContext>()
  .post(
    "/captures",
    requireStaff,
    requireClassScope,
    formBody(captureForm),
    async (c) => {
      const user = c.get("user");
      if (user === null) throw new AuthError();
      const scope = captureScopeOf(c);
      const body = c.req.valid("form");
      const result = await createService(
        MarksheetCaptureService,
        c.get("ctx")
      ).createCapture({
        file: body.file,
        fileName: body.filename ?? body.file.name,
        classId: scope.classId,
        sectionId: scope.sectionId,
        academicId: scope.academicId,
        examTypeId: body.examTypeId,
        ...(body.studentId === undefined ? {} : { studentId: body.studentId }),
        uploadedBy: user.id
      });
      return c.json(toCaptureResultDto(result), 201);
    }
  )
  .post(
    "/captures/:captureId/confirmation",
    requireStaff,
    requireClassScope,
    routeParams(captureIdParams),
    jsonBody(captureConfirmBody),
    async (c) => {
      const user = c.get("user");
      if (user === null) throw new AuthError();
      const { captureId } = c.req.valid("param");
      const { studentId } = c.req.valid("json");
      const capture = await createService(
        MarksheetCaptureService,
        c.get("ctx")
      ).confirmCapture(captureId, studentId, user.id);
      return c.json(toCaptureDto(capture), 200);
    }
  );
