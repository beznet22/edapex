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

/**
 * Update an existing student.
 *
 * Mirrors `StudentPatch` minus placement: `classId`/`sectionId` are deliberately absent
 * because moving a student is a promotion, and `.strict()` turns an attempt into a 400
 * rather than a column write that skips fee and chat-group migration.
 */
export const studentUpdateBody = z
  .object({
    fullName: z.string().trim().min(1).max(191).optional(),
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    dateOfBirth: z.string().trim().max(10).nullable().optional(),
    genderId: positiveId.nullable().optional(),
    studentCategoryId: positiveId.nullable().optional(),
    rollNo: z.coerce.number().int().nonnegative().nullable().optional(),
    email: z.string().trim().toLowerCase().email().max(191).nullable().optional(),
    mobile: z.string().trim().max(40).nullable().optional()
  })
  .strict();

/**
 * Attach a guardian.
 *
 * Either an existing `parentId`, or a name plus optional contact to create one. The service
 * matches by email before creating, so two siblings never produce two parent rows.
 */
export const attachGuardianBody = z
  .object({
    parentId: positiveId.optional(),
    name: z.string().trim().min(1).max(191).optional(),
    email: z.string().trim().toLowerCase().email().max(191).nullable().optional(),
    mobile: z.string().trim().max(40).nullable().optional(),
    relation: z.string().trim().max(40).nullable().optional()
  })
  .strict();
