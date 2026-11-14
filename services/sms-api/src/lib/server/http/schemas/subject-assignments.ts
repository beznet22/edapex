import { z } from "zod";

import { positiveInt } from "./common";

export const subjectAssignmentsBody = z
  .object({
    assignments: z
      .array(
        z
          .object({
            subjectId: positiveInt,
            staffId: positiveInt
          })
          .strict()
      )
      .min(1)
      .max(200)
  })
  .strict();
