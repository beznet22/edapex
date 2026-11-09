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

export const claimLinkDirectoryQuery = z
  .object({
    persona: z.enum(["all", "staff", "parent"]).default("all"),
    status: z
      .enum([
        "all",
        "unclaimed",
        "claimed",
        "flagged",
        "no_user",
        "no_email",
        "non_gmail",
        "duplicate",
        "link_active",
        "link_revoked"
      ])
      .default("all"),
    search: z.string().trim().max(200).default(""),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(50)
  })
  .strict();

export const createClaimLinkBody = z
  .object({
    subjectType: z.enum(["staff", "parent"]),
    subjectId: z.number().int().positive(),
    ttlHours: z.number().int().min(1).max(168).default(72)
  })
  .strict();

export const claimLinkIdParams = z.object({
  id: z.string().uuid()
});
