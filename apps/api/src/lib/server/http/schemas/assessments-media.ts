import { z } from "zod";

import { positiveId, positiveInt } from "./common";

export const feedbackRemarkBody = z
  .object({
    studentId: positiveInt,
    examTypeId: positiveInt,
    remark: z.string().max(2000)
  })
  .strict();

export const feedbackRatingsBody = z
  .object({
    studentId: positiveInt,
    examTypeId: positiveInt,
    ratings: z.record(
      z.string().min(1),
      z.union([z.number().int().min(1).max(5), z.null()])
    )
  })
  .strict();

export const ocrForm = z
  .object({
    file: z.instanceof(File),
    filename: z.string().max(255).optional()
  })
  .strict();

export const captureForm = z
  .object({
    file: z.instanceof(File),
    filename: z.string().max(255).optional(),
    examTypeId: z.coerce.number().int().positive(),
    studentId: z.coerce.number().int().positive().optional()
  })
  .strict();

export const captureIdParams = z
  .object({
    captureId: z.string().trim().min(1).max(64)
  })
  .strict();

export const captureConfirmBody = z
  .object({
    studentId: positiveId
  })
  .strict();
