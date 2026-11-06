import { z } from "zod";

export const issueCodesBody = z
  .object({
    studentIds: z.array(z.number().int().positive()).min(1).max(1_000),
    format: z.enum(["json", "csv"]).optional()
  })
  .strict();

export const studentIdParams = z.object({
  studentId: z.coerce.number().int().positive()
});

export const reassignEmailBody = z
  .object({
    email: z.string().trim().min(3).max(191),
    targetUserId: z.number().int().positive()
  })
  .strict();

export const mergeEmailBody = z
  .object({
    email: z.string().trim().min(3).max(191),
    keepUserId: z.number().int().positive(),
    mergeUserIds: z.array(z.number().int().positive()).min(1).max(10)
  })
  .strict();

export const flagAccountBody = z
  .object({
    userId: z.number().int().positive()
  })
  .strict();

export const claimResetBody = z
  .object({
    confirm: z.literal("RESET_ALL_PASSWORDS")
  })
  .strict();
