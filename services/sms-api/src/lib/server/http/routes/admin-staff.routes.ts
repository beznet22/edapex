import { Hono } from "hono";

import { StaffPhotoService, StaffService, createService } from "../../services";
import type { AppContext } from "../env";
import { formBody, jsonBody, queryParams, routeParams } from "../validation";
import {
  createStaffBody,
  staffIdParams,
  staffListQuery,
  staffPhotoForm,
  staffStatusBody,
  updateStaffBody
} from "../schemas/staff";

/**
 * Staff records.
 *
 * Mounted under `/admin`, which already applies `requireAdmin` — this module does not
 * re-check, so the gate lives in exactly one place.
 *
 * There is no `DELETE`. Marks, attendance, timetables and archives reference `sm_staffs.id`,
 * so removing a row would orphan them; `PATCH /:id/status` is what the UI's "Remove" calls,
 * and it keeps the record and its history while taking the person out of every list.
 */
export const adminStaff = new Hono<AppContext>()
  .get("/staff", queryParams(staffListQuery), async (c) => {
    const query = c.req.valid("query");
    const page = await createService(StaffService, c.get("ctx")).list({
      ...(query.q === undefined ? {} : { query: query.q }),
      ...(query.departmentId === undefined ? {} : { departmentId: query.departmentId }),
      ...(query.designationId === undefined ? {} : { designationId: query.designationId }),
      ...(query.includeInactive === undefined
        ? {}
        : { includeInactive: query.includeInactive }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: query.limit
    });
    c.header("Cache-Control", "no-store");
    return c.json(page, 200);
  })
  .get("/staff/:staffId", routeParams(staffIdParams), async (c) => {
    const { staffId } = c.req.valid("param");
    const staff = await createService(StaffService, c.get("ctx")).get(staffId);
    c.header("Cache-Control", "no-store");
    return c.json(staff, 200);
  })
  .post("/staff", jsonBody(createStaffBody), async (c) => {
    const body = c.req.valid("json");
    const staff = await createService(StaffService, c.get("ctx")).create(body);
    c.header("Cache-Control", "no-store");
    return c.json(staff, 201);
  })
  .patch("/staff/:staffId", routeParams(staffIdParams), jsonBody(updateStaffBody), async (c) => {
    const { staffId } = c.req.valid("param");
    const body = c.req.valid("json");
    const staff = await createService(StaffService, c.get("ctx")).update(staffId, body);
    c.header("Cache-Control", "no-store");
    return c.json(staff, 200);
  })
  .patch(
    "/staff/:staffId/status",
    routeParams(staffIdParams),
    jsonBody(staffStatusBody),
    async (c) => {
      const { staffId } = c.req.valid("param");
      const { active } = c.req.valid("json");
      const staff = await createService(StaffService, c.get("ctx")).setActive(staffId, active);
      c.header("Cache-Control", "no-store");
      return c.json(staff, 200);
    }
  )
  .put("/staff/:staffId/photo", routeParams(staffIdParams), formBody(staffPhotoForm), async (c) => {
    const { staffId } = c.req.valid("param");
    const { file } = c.req.valid("form");
    const photo = await createService(StaffPhotoService, c.get("ctx")).save({ staffId, file });
    c.header("Cache-Control", "no-store");
    return c.json(photo, 200);
  })
  .delete("/staff/:staffId/photo", routeParams(staffIdParams), async (c) => {
    const { staffId } = c.req.valid("param");
    await createService(StaffPhotoService, c.get("ctx")).remove(staffId);
    return c.body(null, 204);
  });
