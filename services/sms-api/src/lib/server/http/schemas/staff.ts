import { z } from "zod";

import { boundedLimit, positiveId } from "./common";

/**
 * The staff list query.
 *
 * `.strict()` like every other query schema here: an unknown parameter is a 400 rather than
 * something silently ignored, which is how a typo in a filter becomes a bug report about
 * "filters do nothing".
 */
export const staffListQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    departmentId: z.coerce.number().int().positive().optional(),
    designationId: z.coerce.number().int().positive().optional(),
    includeInactive: z
      .union([z.literal("true"), z.literal("false")])
      .transform((value) => value === "true")
      .optional(),
    cursor: z.string().trim().max(40).optional(),
    limit: boundedLimit.default(50)
  })
  .strict();

export const staffIdParams = z
  .object({
    staffId: positiveId
  })
  .strict();

/**
 * Create.
 *
 * Names are required because a person with no name cannot be listed meaningfully. Contact is
 * required on at least one channel — see the service, which enforces the either/or that a
 * schema cannot express cleanly.
 */
export const createStaffBody = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(191).nullable().default(null),
    mobile: z.string().trim().max(40).nullable().default(null),
    designationId: positiveId.nullable().default(null),
    departmentId: positiveId.nullable().default(null),
    roleId: positiveId.nullable().default(null),
    genderId: positiveId.nullable().default(null),
    dateOfBirth: z.string().trim().max(10).nullable().default(null),
    qualification: z.string().trim().max(191).nullable().default(null),
    experience: z.string().trim().max(191).nullable().default(null)
  })
  .strict();

/**
 * Update.
 *
 * Mirrors `StaffPatch`, which is the real allowlist. `userId` and `schoolId` are absent on
 * purpose: linking an account is the claim-link flow, and moving a record between tenants
 * is not an update. A request carrying either fails `.strict()` rather than being ignored.
 */
export const updateStaffBody = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().toLowerCase().email().max(191).nullable().optional(),
    mobile: z.string().trim().max(40).nullable().optional(),
    designationId: positiveId.nullable().optional(),
    departmentId: positiveId.nullable().optional(),
    roleId: positiveId.nullable().optional(),
    genderId: positiveId.nullable().optional(),
    dateOfBirth: z.string().trim().max(10).nullable().optional(),
    qualification: z.string().trim().max(191).nullable().optional(),
    experience: z.string().trim().max(191).nullable().optional(),
    activeStatus: z.union([z.literal(0), z.literal(1)]).optional()
  })
  .strict();

export const staffStatusBody = z
  .object({
    active: z.boolean()
  })
  .strict();

/**
 * Multipart photo body.
 *
 * `filename` and `kind` are accepted and ignored — the same shape the student endpoint
 * takes, so one client helper can drive both. Validation reads magic bytes; the filename is
 * caller-controlled and the declared MIME type is a hint at best.
 */
export const staffPhotoForm = z
  .object({
    file: z.instanceof(File),
    filename: z.string().max(255).optional(),
    kind: z.string().max(32).optional()
  })
  .strict();
