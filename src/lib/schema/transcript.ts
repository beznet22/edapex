/**
 * Transcript artifact schema — EdApex
 *
 * The multi-term academic transcript spans all active, non-averaged terms
 * of a single academic year. The schema is the contract between
 * AssessmentService.getTranscript() (producer) and the Svelte transcript
 * template (consumer). No DB writes occur here.
 */

import { z } from "zod";
import { schoolSchema, studentSchema } from "$lib/schema/marksheet";

export const transcriptTermSchema = z.object({
  examTypeId: z.number().int().positive(),
  title: z.string(),
  isAverage: z.boolean(),
});
export type TranscriptTerm = z.infer<typeof transcriptTermSchema>;

export const transcriptSubjectRowSchema = z
  .object({
    subjectId: z.number().int().positive(),
    subject: z.string(),
    subjectCode: z.string(),
    marks: z.array(z.number().nullable()).min(1),
    total: z.number().min(0),
    percentage: z.number().min(0).max(100),
    grade: z.string(),
    color: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.marks.length !== 1 && data.marks.length !== 2 && data.marks.length !== 3) {
      ctx.addIssue({
        code: "custom",
        message: "marks must have 1, 2, or 3 entries",
        path: ["marks"],
      });
    }
    for (const mark of data.marks) {
      if (mark !== null && mark > 100) {
        ctx.addIssue({
          code: "custom",
          message: "Per-term mark exceeds 100%",
          path: ["marks"],
        });
        break;
      }
    }
    if (data.total > 300) {
      ctx.addIssue({
        code: "custom",
        message: "Cumulative subject total exceeds 300",
        path: ["total"],
      });
    }
  });
export type TranscriptSubjectRow = z.infer<typeof transcriptSubjectRowSchema>;

export const transcriptAcademicYearSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  year: z.string(),
});
export type TranscriptAcademicYear = z.infer<typeof transcriptAcademicYearSchema>;

export const transcriptSchema = z
  .object({
    school: schoolSchema,
    student: studentSchema,
    academicYear: transcriptAcademicYearSchema,
    terms: z.array(transcriptTermSchema).min(1),
    subjects: z.array(transcriptSubjectRowSchema).min(1),
    classAverage: z.number().min(0).max(100),
    studentAverage: z.number().min(0).max(100),
    yearlyTotal: z.number().min(0),
    yearlyAverage: z.number().min(0).max(100),
    maxPossibleTotal: z.number().min(0),
  })
  .superRefine((data, ctx) => {
    if (data.subjects.length === 0) {
      if (data.yearlyTotal !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "yearlyTotal must be 0 when there are no subjects",
          path: ["yearlyTotal"],
        });
      }
    } else if (data.yearlyTotal <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "yearlyTotal must be positive when subjects are present",
        path: ["yearlyTotal"],
      });
    }
    data.subjects.forEach((subject, idx) => {
      if (subject.marks.length !== data.terms.length) {
        ctx.addIssue({
          code: "custom",
          message: `marks array length (${subject.marks.length}) must equal terms array length (${data.terms.length})`,
          path: ["subjects", idx, "marks"],
        });
      }
    });
  });
export type Transcript = z.infer<typeof transcriptSchema>;
