import { z } from "zod";

export const magicLinkBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(191)
  })
  .strict();

export const mobileTokenBody = z
  .object({
    token: z.string().min(1).max(512)
  })
  .strict();

export const claimBody = z
  .object({
    email: z.string().trim().min(3).max(191),
    password: z.string().min(1).max(200)
  })
  .strict();

export const claimLinkExchangeBody = z
  .object({
    token: z.string().trim().min(32).max(256)
  })
  .strict();

export const codeBody = z
  .object({
    code: z.string().trim().min(4).max(32)
  })
  .strict();

const pkceValue = z.string().trim().regex(/^[A-Za-z0-9_-]{43,128}$/);

export const desktopStartBody = z
  .object({
    codeChallenge: pkceValue,
    redirectUri: z.literal("edapex://auth")
  })
  .strict();

export const desktopExchangeBody = z
  .object({
    code: z.string().trim().min(32).max(4096),
    codeVerifier: pkceValue
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
