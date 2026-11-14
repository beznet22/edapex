import { z } from "zod";

import { positiveInt } from "./common";

export const attendanceBody = z
  .object({
    studentId: positiveInt,
    examTypeId: positiveInt,
    attendance: z
      .object({
        daysOpened: z.number().int().nonnegative(),
        daysAbsent: z.number().int().nonnegative(),
        daysPresent: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict();
