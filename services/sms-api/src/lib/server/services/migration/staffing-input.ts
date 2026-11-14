import { z } from "zod";

const positiveInt = z.number().int().positive();

export const staffingBodySchema = z
  .object({
    classTeacherId: positiveInt.nullable().default(null),
    assignments: z
      .array(
        z
          .object({
            subjectId: positiveInt,
            staffId: positiveInt
          })
          .strict()
      )
      .max(200)
      .default([]),
    noSubjects: z.boolean().default(false)
  })
  .strict();

export type StaffingBody = z.infer<typeof staffingBodySchema>;
