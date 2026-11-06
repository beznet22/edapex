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
