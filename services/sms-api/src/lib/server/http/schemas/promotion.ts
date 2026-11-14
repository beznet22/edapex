import { z } from "zod";

export { promotionBodySchema as promotionBody } from "../../services/migration/promotion-input";
export { reverseBodySchema as reverseBody } from "../../services/migration/promotion-input";

export const promotionParams = z
  .object({
    id: z.coerce.number().int().positive(),
    jobId: z.string().trim().min(1).max(100)
  })
  .strict();

export const promotionBatchParams = z
  .object({ batchId: z.coerce.number().int().positive() })
  .strict();
