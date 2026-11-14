import { z } from "zod";

import { schoolSchema, studentSchema } from "./marksheet";

export const transcriptTermSchema = z.object({
  examTypeId: z.number().int().positive(),
  title: z.string(),
  isAverage: z.boolean()
});
export type TranscriptTerm = z.infer<typeof transcriptTermSchema>;

export const transcriptSubjectRowSchema = z
  .object({
    subjectId: z.number().int().positive(),
    subject: z.string(),
    subjectCode: z.string(),
    marks: z.array(z.number().nullable()).min(1),
    total: z.number(),
    percentage: z.number().min(0).max(1000),
    grade: z.string(),
    color: z.string().optional()
  });
export type TranscriptSubjectRow = z.infer<typeof transcriptSubjectRowSchema>;

export const transcriptAcademicYearSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  year: z.string()
});
export type TranscriptAcademicYear = z.infer<typeof transcriptAcademicYearSchema>;

export const transcriptSchema = z
  .object({
    school: schoolSchema,
    student: studentSchema,
    academicYear: transcriptAcademicYearSchema,
    terms: z.array(transcriptTermSchema).min(1),
    subjects: z.array(transcriptSubjectRowSchema).min(1),
    classAverage: z.number().min(0).max(1000),
    studentAverage: z.number().min(0).max(1000),
    yearlyTotal: z.number(),
    yearlyAverage: z.number().min(0).max(1000),
    maxPossibleTotal: z.number().min(0)
  })
  .superRefine((data, ctx) => {
    if (data.subjects.length === 0) {
      if (data.yearlyTotal !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "yearlyTotal must be 0 when there are no subjects",
          path: ["yearlyTotal"]
        });
      }
    }
    data.subjects.forEach((subject, index) => {
      if (subject.marks.length !== data.terms.length) {
        ctx.addIssue({
          code: "custom",
          message: `marks array length (${subject.marks.length}) must equal terms array length (${data.terms.length})`,
          path: ["subjects", index, "marks"]
        });
      }
    });
  });
export type Transcript = z.infer<typeof transcriptSchema>;
