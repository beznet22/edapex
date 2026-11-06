import { Hono } from "hono";

import { createService } from "../../services";
import { AssessmentEntryService } from "../../services/assessment";
import {
  toMarksheetDto,
  toStudentResultDto
} from "../dto/assessments-core";
import type { AppContext } from "../env";
import { requireStaff, staffIdOf } from "../middleware/authorize";
import { requireClassScope } from "../middleware/tenant";
import {
  marksheetBody,
  studentResultBody
} from "../schemas/assessments-core";
import { jsonAsyncBody, jsonBody } from "../validation";

export const assessments = new Hono<AppContext>()
  .post(
    "/marksheets",
    requireStaff,
    requireClassScope,
    jsonAsyncBody(marksheetBody),
    async (c) => {
      const { marksheet } = c.req.valid("json");
      const saved = await createService(
        AssessmentEntryService,
        c.get("ctx")
      ).upsertMarksheet(marksheet, staffIdOf(c));
      return c.json(toMarksheetDto(saved), 200);
    }
  )
  .put(
    "/results",
    requireStaff,
    requireClassScope,
    jsonBody(studentResultBody),
    async (c) => {
      const body = c.req.valid("json");
      const { studentData } = body;
      const result = await createService(
        AssessmentEntryService,
        c.get("ctx")
      ).upsertStudentResult(
        {
          studentData: {
            studentId: studentData.studentId,
            classId: studentData.classId,
            sectionId: studentData.sectionId,
            examTypeId: studentData.examTypeId,
            studentCategory: studentData.studentCategory,
            ...(studentData.recordId === undefined
              ? {}
              : { recordId: studentData.recordId }),
            ...(studentData.studentCategoryId === undefined
              ? {}
              : { studentCategoryId: studentData.studentCategoryId }),
            ...(studentData.attendance === undefined
              ? {}
              : { attendance: studentData.attendance })
          },
          marksData: body.marksData.map((entry) => ({
            subjectId: entry.subjectId,
            marks: entry.marks,
            ...(entry.learningOutcome === undefined
              ? {}
              : { learningOutcome: entry.learningOutcome })
          })),
          ...(body.teachersRemark === undefined
            ? {}
            : { teachersRemark: body.teachersRemark }),
          ...(body.studentRatings === undefined
            ? {}
            : { studentRatings: body.studentRatings })
        },
        staffIdOf(c)
      );
      return c.json(toStudentResultDto(result), 200);
    }
  );
