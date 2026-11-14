import { z } from "zod";

import { CATEGORY_VALUES } from "../../../constants/assessment";
import { marksheetSchema } from "../../../schema/marksheet";
import { booleanQuery, positiveId, positiveInt } from "./common";

export const marksheetBody = z
  .object({
    marksheet: marksheetSchema
  })
  .strict();

const attendanceInput = z
  .object({
    daysOpened: z.number().int().nonnegative(),
    daysAbsent: z.number().int().nonnegative(),
    daysPresent: z.number().int().nonnegative()
  })
  .strict();

const markStoreEntry = z
  .object({
    subjectId: positiveInt,
    marks: z.record(z.string(), z.number()),
    learningOutcome: z.string().nullable().optional()
  })
  .strict();

export const studentResultBody = z
  .object({
    studentData: z
      .object({
        studentId: positiveInt,
        classId: positiveInt,
        sectionId: positiveInt,
        recordId: positiveInt.optional(),
        examTypeId: positiveInt,
        studentCategory: z.enum(CATEGORY_VALUES),
        studentCategoryId: positiveInt.optional(),
        attendance: attendanceInput.optional()
      })
      .strict(),
    marksData: z.array(markStoreEntry).min(1),
    teachersRemark: z
      .object({
        comment: z.string().nullable()
      })
      .strict()
      .optional(),
    studentRatings: z
      .record(
        z.string(),
        z.union([z.number().int().min(1).max(5), z.null()])
      )
      .optional()
  })
  .strict();

export const resultParams = z
  .object({
    identifier: z.string().trim().min(1).max(64),
    examId: positiveId
  })
  .strict();

export const resultQuery = z
  .object({
    byAdmission: booleanQuery,
    withImages: booleanQuery
  })
  .strict();

export const transcriptParams = z
  .object({
    studentId: positiveId,
    academicId: positiveId
  })
  .strict();

export const transcriptQuery = z
  .object({
    withImages: booleanQuery
  })
  .strict();

export const publishResultsBody = z
  .object({
    examId: positiveInt,
    studentIds: z.array(positiveInt).min(1).max(200),
    resend: z.boolean().optional()
  })
  .strict();

export const publishTranscriptBody = z
  .object({
    to: z.string().trim().email(),
    parentName: z.string().trim().min(1).max(191),
    studentName: z.string().trim().min(1).max(191),
    academicYear: z.string().trim().min(1).max(64),
    html: z.string().max(500_000).optional(),
    pdfFilename: z.string().max(255).optional()
  })
  .strict();
