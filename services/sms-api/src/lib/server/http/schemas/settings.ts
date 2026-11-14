import { z } from "zod";

import { positiveId, positiveInt } from "./common";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const generalSettingsPatch = z
  .object({
    schoolName: z.string().trim().max(191).nullable().optional(),
    phone: z.string().trim().max(191).nullable().optional(),
    email: z.string().trim().email().max(191).nullable().optional(),
    address: z.string().trim().max(191).nullable().optional(),
    logo: z.string().max(2048).nullable().optional(),
    identity: z.string().max(2048).nullable().optional()
  })
  .strict();

export const academicYearBody = z
  .object({
    year: z.string().trim().min(1).max(32),
    title: z.string().trim().min(1).max(191),
    startingDate: isoDate,
    endingDate: isoDate
  })
  .strict();

export const activeAcademicYearBody = z
  .object({
    academicId: positiveInt
  })
  .strict();

export const examTypeIdParams = z
  .object({
    examTypeId: positiveId
  })
  .strict();

export const examTypeBody = z
  .object({
    name: z.string().trim().min(1).max(191),
    startsOn: isoDate.nullable().optional(),
    endsOn: isoDate.nullable().optional(),
    status: z.enum(["planned", "active", "closed"]).optional(),
    grading: z.string().max(191).nullable().optional()
  })
  .strict();

export const reportSettingsPatch = z
  .object({
    termlyReportTitle: z.string().max(191).optional(),
    annualReportTitle: z.string().max(191).optional(),
    principalName: z.string().max(191).optional(),
    supportEmail: z.string().trim().email().max(191).optional(),
    resultEmailSubject: z.string().max(191).optional()
  })
  .strict();
