import { Hono } from "hono";

import { createService } from "../../services";
import { NotFoundError } from "../../services/errors";
import { AcademicSettingsService } from "../../services/settings";
import {
  toAcademicYearDto,
  toExamTypeDto
} from "../dto/settings";
import type { AppContext } from "../env";
import { requireAdmin } from "../middleware/authorize";
import {
  academicYearBody,
  activeAcademicYearBody,
  examTypeBody,
  examTypeIdParams
} from "../schemas/settings";
import { jsonBody, routeParams } from "../validation";

export const settingsAcademic = new Hono<AppContext>()
  .get("/academic-years", requireAdmin, async (c) => {
    const service = createService(AcademicSettingsService, c.get("ctx"));
    const years = await service.listAcademicYears();
    const activeYear = await service.getActiveAcademicYear();
    return c.json(
      {
        years: years.map(toAcademicYearDto),
        activeYear: activeYear === null ? null : toAcademicYearDto(activeYear)
      },
      200
    );
  })
  .post(
    "/academic-years",
    requireAdmin,
    jsonBody(academicYearBody),
    async (c) => {
      const created = await createService(
        AcademicSettingsService,
        c.get("ctx")
      ).createAcademicYear(c.req.valid("json"));
      return c.json({ year: toAcademicYearDto(created) }, 201);
    }
  )
  .get("/academic-years/active", requireAdmin, async (c) => {
    const activeYear = await createService(
      AcademicSettingsService,
      c.get("ctx")
    ).getActiveAcademicYear();
    return c.json(
      { year: activeYear === null ? null : toAcademicYearDto(activeYear) },
      200
    );
  })
  .put(
    "/academic-years/active",
    requireAdmin,
    jsonBody(activeAcademicYearBody),
    async (c) => {
      const { academicId } = c.req.valid("json");
      const years = await createService(
        AcademicSettingsService,
        c.get("ctx")
      ).setActiveAcademicYear(academicId);
      const activeYear = years.find((year) => year.activeStatus === 1) ?? null;
      return c.json(
        {
          years: years.map(toAcademicYearDto),
          activeYear: activeYear === null ? null : toAcademicYearDto(activeYear)
        },
        200
      );
    }
  )
  .get("/exam-types", requireAdmin, async (c) => {
    const examTypes = await createService(
      AcademicSettingsService,
      c.get("ctx")
    ).listExamTypes();
    return c.json({ examTypes: examTypes.map(toExamTypeDto) }, 200);
  })
  .post("/exam-types", requireAdmin, jsonBody(examTypeBody), async (c) => {
    const created = await createService(
      AcademicSettingsService,
      c.get("ctx")
    ).createExamType(c.req.valid("json"));
    return c.json({ examType: toExamTypeDto(created) }, 201);
  })
  .patch(
    "/exam-types/:examTypeId/active",
    requireAdmin,
    routeParams(examTypeIdParams),
    async (c) => {
      const { examTypeId } = c.req.valid("param");
      const updated = await createService(
        AcademicSettingsService,
        c.get("ctx")
      ).toggleExamTypeActive(examTypeId);
      if (updated === null) throw new NotFoundError("Exam type", examTypeId);
      return c.json({ examType: toExamTypeDto(updated) }, 200);
    }
  );
