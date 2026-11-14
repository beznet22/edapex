import { z } from "zod";

import { boundedLimit, positiveId, positiveInt } from "./common";

export const studentIdParams = z
  .object({
    studentId: positiveId
  })
  .strict();

export const studentListQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    limit: boundedLimit.default(50)
  })
  .strict();

export const studentStatusBody = z
  .object({
    active: z.boolean()
  })
  .strict();

export const studentPhotoForm = z
  .object({
    file: z.instanceof(File),
    filename: z.string().max(255).optional(),
    kind: z.string().max(32).optional()
  })
  .strict();

export const photoClaimBody = z
  .object({
    url: z
      .string()
      .regex(/^\/uploads\/students\/[a-f0-9]{64}\.(?:jpe?g|png|webp)$/i)
  })
  .strict();

export const promotionBody = z
  .object({
    classId: positiveInt,
    sectionId: positiveInt,
    targetAcademicId: positiveInt.optional(),
    rollNo: positiveInt.optional(),
    resultStatus: z.string().trim().max(50).optional()
  })
  .strict();

export const demotionBody = z
  .object({
    promotionId: positiveInt.optional()
  })
  .strict();
