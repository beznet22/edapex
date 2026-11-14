import { z } from "zod";

const positiveInt = z.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const stage = z.enum(["EARLY_YEARS", "LOWER_BASIC", "MIDDLE_BASIC", "UPPER_BASIC"]);

export const newSessionSchema = z
  .object({
    id: positiveInt,
    year: z.string().trim().min(1).max(20),
    title: z.string().trim().min(1).max(50),
    startsOn: isoDate,
    endsOn: isoDate
  })
  .strict()
  .refine((value) => value.startsOn < value.endsOn, {
    message: "The session must end after it starts",
    path: ["endsOn"]
  });

export const termInputSchema = z
  .object({
    sequence: positiveInt,
    name: z.string().trim().min(1).max(60),
    startsOn: isoDate,
    endsOn: isoDate
  })
  .strict()
  .refine((value) => value.startsOn < value.endsOn, {
    message: "A term must end after it starts",
    path: ["endsOn"]
  });

const classInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    stage,
    sortOrder: z.number().int().nonnegative()
  })
  .strict();

const copyTarget = z.enum([
  "sections",
  "classSections",
  "subjects",
  "subjectAssignments",
  "classTeachers",
  "routines",
  "gradeBands",
  "studentCategories",
  "feeStructures"
]);

export const bootstrapInputSchema = z
  .object({
    newSession: newSessionSchema,
    copyFromSessionId: positiveInt,
    terms: z.array(termInputSchema).max(10).default([]),
    classes: z
      .object({
        copyFromSource: z.boolean().default(true),
        add: z.array(classInputSchema).max(20).default([])
      })
      .strict()
      .default({ copyFromSource: true, add: [] }),
    copy: z.array(copyTarget).default([
      "sections",
      "classSections",
      "subjects",
      "subjectAssignments",
      "classTeachers",
      "routines",
      "gradeBands",
      "studentCategories",
      "feeStructures"
    ]),
    activate: z.boolean().default(false),
    dryRun: z.boolean().default(false),
    allowNonEmpty: z.boolean().default(false),
    force: z.boolean().default(false),
    reason: z.string().trim().max(500).optional(),
    allowUnreviewedStaffing: z.boolean().default(false)
  })
  .strict();

export type BootstrapInput = z.infer<typeof bootstrapInputSchema>;

export const termsInputSchema = z
  .object({
    terms: z.array(termInputSchema).min(1).max(10),
    dryRun: z.boolean().default(false)
  })
  .strict();

export type TermsInput = z.infer<typeof termsInputSchema>;

export const bootstrapJobPayloadSchema = z
  .object({
    input: bootstrapInputSchema,
    actorId: positiveInt
  })
  .strict();

export type BootstrapJobPayload = z.infer<typeof bootstrapJobPayloadSchema>;

const mapSchema = z.record(z.string(), z.number().int().positive());

export const bootstrapProgressSchema = z
  .object({
    step: z.number().int().nonnegative(),
    steps: z.array(z.string()),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    maps: z
      .object({
        class: mapSchema,
        section: mapSchema,
        subject: mapSchema
      })
      .strict(),
    notes: z.array(z.string())
  })
  .strict();

export type BootstrapProgress = z.infer<typeof bootstrapProgressSchema>;

export const bootstrapResultSchema = z
  .object({
    sessionId: positiveInt,
    counts: z.record(z.string(), z.number().int().nonnegative()),
    readiness: z
      .object({
        classesWithoutAssignments: z.number().int().nonnegative(),
        unstaffedTotal: z.number().int().nonnegative(),
        unreviewedSections: z.number().int().nonnegative(),
        reviewedSections: z.number().int().nonnegative(),
        teachersWithoutClasses: z.number().int().nonnegative(),
        duplicateCurrentRecords: z.number().int().nonnegative(),
        targetCurrentRecords: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict();

export type BootstrapResult = z.infer<typeof bootstrapResultSchema>;

export interface BootstrapJobView {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly academicId: number | null;
  readonly progress: BootstrapProgress | null;
  readonly result: BootstrapResult | null;
  readonly error: string | null;
  readonly createdAt: number;
  readonly updatedAt: number | null;
  readonly finishedAt: number | null;
}

export const BOOTSTRAP_STEPS = [
  "academicYear",
  "terms",
  "classes",
  "sections",
  "subjects",
  "classSections",
  "categories",
  "gradeBands",
  "subjectAssignments",
  "classTeachers",
  "routines",
  "examConfigs",
  "activate"
] as const;

export function initialBootstrapProgress(): BootstrapProgress {
  return {
    step: 0,
    steps: [...BOOTSTRAP_STEPS],
    counts: {},
    maps: { class: {}, section: {}, subject: {} },
    notes: []
  };
}
