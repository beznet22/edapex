import { z } from "zod";

const positiveInt = z.number().int().positive();

const readinessSchema = z
  .object({
    classesWithoutAssignments: z.number().int().nonnegative(),
    unstaffedTotal: z.number().int().nonnegative(),
    unreviewedSections: z.number().int().nonnegative(),
    reviewedSections: z.number().int().nonnegative(),
    teachersWithoutClasses: z.number().int().nonnegative(),
    duplicateCurrentRecords: z.number().int().nonnegative(),
    targetCurrentRecords: z.number().int().nonnegative()
  })
  .strict();

export const promotionBodySchema = z
  .object({
    dryRun: z.boolean().default(false),
    classes: z.array(positiveInt).max(30).optional(),
    outcomeForMissing: z.enum(["quarantine", "carry-forward"]).default("quarantine")
  })
  .strict();

export type PromotionBody = z.infer<typeof promotionBodySchema>;

export const reverseBodySchema = z.object({ dryRun: z.boolean().default(false) }).strict();

export const promotionJobPayloadSchema = z
  .object({
    targetAcademicId: positiveInt,
    sourceAcademicId: positiveInt,
    actorId: positiveInt,
    outcomeForMissing: z.enum(["quarantine", "carry-forward"]).default("quarantine"),
    classes: z.array(positiveInt).max(30).optional()
  })
  .strict();

export type PromotionJobPayload = z.infer<typeof promotionJobPayloadSchema>;

export const promotionProgressSchema = z
  .object({
    batchIds: z.array(positiveInt),
    batchIndex: z.number().int().nonnegative(),
    unplacedClassIds: z.array(positiveInt),
    carryForwardDone: z.boolean().default(false),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    notes: z.array(z.string())
  })
  .strict();

export type PromotionProgress = z.infer<typeof promotionProgressSchema>;

export const promotionResultSchema = z
  .object({
    targetAcademicId: positiveInt,
    sourceAcademicId: positiveInt,
    counts: z.record(z.string(), z.number().int().nonnegative()),
    readiness: readinessSchema
  })
  .strict();

export type PromotionResult = z.infer<typeof promotionResultSchema>;

export interface PromotionJobView {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly academicId: number | null;
  readonly progress: PromotionProgress | null;
  readonly result: PromotionResult | null;
  readonly error: string | null;
  readonly createdAt: number;
  readonly updatedAt: number | null;
  readonly finishedAt: number | null;
}

export function initialPromotionProgress(): PromotionProgress {
  return {
    batchIds: [],
    batchIndex: 0,
    unplacedClassIds: [],
    carryForwardDone: false,
    counts: {},
    notes: []
  };
}
