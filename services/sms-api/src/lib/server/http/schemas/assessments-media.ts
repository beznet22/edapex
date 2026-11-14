import { z } from "zod";

import { jsonValueSchema } from "@edapex/contracts/json";

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

export const localOcrBody = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(100),
    rawText: z.string().trim().min(1).max(1_048_576),
    annotation: jsonValueSchema,
    pageCount: z.number().int().min(1).max(200),
    engine: z.literal("rusto"),
    engineVersion: z.string().trim().min(1).max(32),
    meanConfidence: z.number().min(0).max(1),
    warnings: z.array(z.string().max(200)).max(20).default([])
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
