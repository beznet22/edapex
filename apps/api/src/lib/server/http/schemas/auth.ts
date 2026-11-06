import { z } from "zod";

export const loginBody = z
  .object({
    identifier: z.string().trim().min(1).max(191),
    password: z.string().min(1).max(200)
  })
  .strict();

export const mobileTokenBody = z
  .object({
    token: z.string().min(1).max(512)
  })
  .strict();

export const profilePatchBody = z
  .object({
    fullName: z.string().min(1).nullable().optional(),
    username: z.string().min(1).nullable().optional(),
    phoneNumber: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    styleId: z.number().int().nullable().optional(),
    rtlLtl: z.number().int().nullable().optional(),
    deviceToken: z.string().nullable().optional()
  })
  .strict();
