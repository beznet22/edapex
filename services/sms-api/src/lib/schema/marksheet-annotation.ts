import { z } from "zod";

import { CATEGORY_VALUES } from "../constants/assessment";

const annotationMarkSchema = z.object({
  title: z.string().min(1).describe("Exam title as printed, e.g. CA, EXAM, HW"),
  value: z.number().int().min(0).nullable().describe("Mark as printed; null when blank")
});

const annotationSubjectSchema = z.object({
  subjectCode: z.string().min(1).describe("Subject code as printed"),
  marks: z.array(annotationMarkSchema).describe("Named marks; never positional"),
  learningOutcome: z.string().nullable().describe("Required for DAYCARE, otherwise null")
});

/**
 * The JSON-schema-friendly OCR contract. It deliberately has no transforms or
 * async refinements so `z.toJSONSchema` can send it to the provider; semantic
 * validation happens afterwards in `domain/marksheet-validation.ts`.
 */
export const marksheetAnnotationSchema = z.object({
  student: z.object({
    fullName: z.string().min(1),
    admissionNo: z.string().nullable(),
    className: z.string().nullable(),
    sectionName: z.string().nullable(),
    category: z.enum(CATEGORY_VALUES),
    term: z.string().nullable(),
    academicYear: z.string().nullable()
  }),
  attendance: z.object({
    daysOpened: z.number().int().min(0).nullable(),
    daysPresent: z.number().int().min(0).nullable(),
    daysAbsent: z.number().int().min(0).nullable()
  }),
  subjects: z.array(annotationSubjectSchema).min(1),
  ratings: z.array(
    z.object({
      attribute: z.string().min(1),
      rate: z.number().int().min(1).max(5).nullable()
    })
  ),
  remark: z.string().nullable()
});

export type MarksheetAnnotation = z.infer<typeof marksheetAnnotationSchema>;

export function marksheetAnnotationJsonSchema(): Readonly<Record<string, unknown>> {
  return z.toJSONSchema(marksheetAnnotationSchema);
}
