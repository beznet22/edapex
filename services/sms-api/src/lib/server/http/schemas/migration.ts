import { z } from "zod";

export { bootstrapInputSchema as bootstrapBody } from "../../services/migration/bootstrap-input";
export { termsInputSchema as termsBody } from "../../services/migration/bootstrap-input";
export { staffingBodySchema as staffingBody } from "../../services/migration/staffing-input";

export const sessionParams = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const staffingParams = z
  .object({
    id: z.coerce.number().int().positive(),
    classId: z.coerce.number().int().positive(),
    sectionId: z.coerce.number().int().positive()
  })
  .strict();

export const bootstrapJobParams = z
  .object({ jobId: z.string().trim().min(1).max(100) })
  .strict();

export const resolutionsQuery = z
  .object({
    format: z.enum(["json", "csv"]).optional(),
    findingId: z.string().trim().min(1).max(40).optional(),
    limit: z.coerce.number().int().positive().max(10000).optional()
  })
  .strict();
