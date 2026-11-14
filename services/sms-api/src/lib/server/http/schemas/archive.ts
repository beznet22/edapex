import { z } from "zod";

export const archiveSessionParams = z.object({
  id: z.coerce.number().int().positive()
});

export const archiveJobParams = z.object({
  id: z.string().min(1)
});

export const archiveBody = z.object({
  purge: z.boolean().optional(),
  dryRun: z.boolean().optional()
});

export const restoreBody = z.object({
  dryRun: z.boolean().optional()
});

export const wipeBody = z.object({
  confirm: z.string().optional(),
  sessionIds: z.array(z.number().int().positive()).min(1),
  secondAdminToken: z.string().optional(),
  dryRun: z.boolean().optional()
});

export const jobListQuery = z.object({
  type: z.enum(["archive", "restore", "wipe"]).optional(),
  status: z
    .enum(["queued", "running", "completed", "failed", "cancelled", "awaiting_approval"])
    .optional()
});

export const studentIdParams = z.object({
  id: z.coerce.number().int().positive()
});

export const marksheetParams = z.object({
  id: z.coerce.number().int().positive(),
  examTypeId: z.coerce.number().int().positive()
});

export const archivedMarksheetParams = z.object({
  id: z.coerce.number().int().positive(),
  sessionId: z.coerce.number().int().positive(),
  examTypeId: z.coerce.number().int().positive()
});

export const transcriptParams = z.object({
  id: z.coerce.number().int().positive(),
  sessionId: z.coerce.number().int().positive()
});

export const marksheetQuery = z.object({
  examTypeId: z.coerce.number().int().positive().optional(),
  sessionId: z.coerce.number().int().positive().optional()
});

export const tokenParams = z.object({
  token: z.string().min(1)
});

export const tokenIdParams = z.object({
  tokenId: z.coerce.number().int().positive()
});

export const supersedeBody = z.object({
  reason: z.string().min(1)
});

export const overrideBody = z.object({
  reason: z.string().min(1),
  totalMarks: z.number().min(0).max(100).optional(),
  isAbsent: z.boolean().optional(),
  teacherRemarks: z.string().nullable().optional()
});

export const resultParams = z.object({
  id: z.coerce.number().int().positive()
});
