import { Hono } from "hono";

import { createService, StudentPhotoService } from "../../services";
import { toPhotoClaimDto, toStudentPhotoDto } from "../dto/students";
import type { AppContext } from "../env";
import { requireClassScope } from "../middleware/tenant";
import {
  photoClaimBody,
  studentIdParams,
  studentPhotoForm
} from "../schemas/students";
import { formBody, jsonBody, routeParams } from "../validation";

export const studentPhotos = new Hono<AppContext>()
  .put(
    "/:studentId/photo",
    requireClassScope,
    routeParams(studentIdParams),
    formBody(studentPhotoForm),
    async (c) => {
      const { studentId } = c.req.valid("param");
      const { file } = c.req.valid("form");
      const result = await createService(
        StudentPhotoService,
        c.get("ctx")
      ).save({ studentId, file });
      return c.json(toStudentPhotoDto(result), 200);
    }
  )
  .post(
    "/:studentId/photo/claim",
    requireClassScope,
    routeParams(studentIdParams),
    jsonBody(photoClaimBody),
    async (c) => {
      const { studentId } = c.req.valid("param");
      const { url } = c.req.valid("json");
      const result = await createService(
        StudentPhotoService,
        c.get("ctx")
      ).claim({ studentId, url });
      return c.json(toPhotoClaimDto(result), 200);
    }
  )
  .delete(
    "/:studentId/photo",
    requireClassScope,
    routeParams(studentIdParams),
    async (c) => {
      const { studentId } = c.req.valid("param");
      await createService(StudentPhotoService, c.get("ctx")).remove(studentId);
      return c.body(null, 204);
    }
  );
