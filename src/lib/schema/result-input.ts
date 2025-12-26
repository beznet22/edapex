import { studentRepo } from "$lib/server/repository/student.repo";
import { z } from "zod";

export enum AttributeEnum {
  Poor = 1,
  Fair,
  Good,
  VeryGood,
  Excellent,
}

export const AttributeRemark = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

// Helper function to match names
const matchName = (fullName: string, targetName?: string): boolean => {
  if (!fullName || !targetName) return false;
  const normalize = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);

  const fullSet = new Set(normalize(fullName));
  const targetSet = new Set(normalize(targetName));

  let matches = 0;
  for (const part of fullSet) {
    if (targetSet.has(part)) {
      matches++;
      if (matches >= 2) return true;
    }
  }

  return false;
};

const AttributeSchema = z
  .number()
  .refine((val) => Object.values(AttributeEnum).includes(val), { message: "Invalid attribute score" });

export const studentRatingsSchema = z.object({
  adherent_and_independent: AttributeSchema.nullable(),
  flexibility_and_creativity: AttributeSchema.nullable(),
  meticulous: AttributeSchema.nullable(),
  neatness: AttributeSchema.nullable(),
  overall_progress: AttributeSchema.nullable(),
  self_control_and_interaction: AttributeSchema.nullable(),
});

export type StudentRatings = z.infer<typeof studentRatingsSchema>;

export const attendanceSchema = z.object({
  daysOpened: z.number().describe("The number of days school opened"),
  daysAbsent: z.number().describe("The number of days student was absent"),
  daysPresent: z.number().describe("The number of days student was present"),
});
export type Attendance = z.infer<typeof attendanceSchema>;

export const studentDataSchema = z.object({
  studentId: z.number().int().positive().nullable().describe("Unique student ID"),
  recordId: z.number().int().positive().nullable().describe("Unique student record ID"),
  schoolId: z.number().int().positive().nullable().describe("Unique school ID"),
  admissionNo: z.number().int().positive().describe("Unique admission/enrolment number"),
  fullName: z.string().min(1, "Student full name required").describe("Full name of the student"),
  class: z.string().describe("Assigned class (e.g. GRADE KA)"),
  classId: z.number().int().positive().describe("Mapped class ID from classes mapping"),
  sectionId: z.number().int().positive().describe("Mapped section ID from sections mapping"),
  studentCategory: z
    .string()
    .describe("Category of the student mapped from the class category (e.g., GRADE K)"),
  studentCategoryId: z
    .number()
    .int()
    .positive()
    .describe("Mapped student category ID from studentCategories mapping"),
  term: z.string().describe("Academic term or examination period"),
  examTypeId: z.number().int().positive().describe("Mapped exam type ID from examTypes mapping"),
  attendance: attendanceSchema.describe("Attendance details for the period"),
}).superRefine(async (data, ctx) => {
  if (data.admissionNo) {
    const student = await studentRepo.getStudentRecordByAdmissionNo(data.admissionNo);
    if (!student) {
      ctx.addIssue({
        code: "custom",
        message: `Student not found for admission number ${data.admissionNo}`,
        path: ["admissionNo"],
      });
    }

    const match = matchName(data.fullName, student?.fullName || undefined);
    if (!match) {
      console.log({
        studentName: student?.fullName,
        currentName: data.fullName,
      });
      ctx.addIssue({
        code: "custom",
        message: [
          `Student name ${data.fullName} does not match admission number ${data.admissionNo}`,
          "If you are sure name matches, please ask the admin to update student name else correct the admission number",
          `Student name: ${student?.fullName}, Current name: ${data.fullName}`,
        ].join("\n"),
        path: ["fullName"],
      });
    }

    data.schoolId = student?.schoolId || 1;
    data.recordId = student?.recordId || null;
    data.studentId = student?.studentId || null;
  }
})
export type StudentInput = z.infer<typeof studentDataSchema>;

export const marksDataSchema = z
  .array(
    z.object({
      subjectCode: z.string().min(1, "Subject code required").describe("Subject code (e.g., PSRN/QR)"),
      subjectId: z.number().int().positive().describe("Mapped subject ID from subjects mapping"),
      learningOutcome: z.string().nullable().optional().describe("Learning outcome (ONLY for DAYCARE)"),
      examTitles: z
        .array(z.string())
        .optional()
        .describe(
          "Array of string representing the actual titles of the marks (e.g., CA1, CA2, HW, REPORT, PSYCHO, EXAM)"
        ),
      marks: z
        .array(z.number())
        .optional()
        .describe("Array of numbers representing the actual values of the marks (e.g., 20, 19, 2, 3, 4, 50)"),
      total: z.number().positive().nonnegative().optional().describe("Total marks for the subject"),
      grade: z.string().min(1).optional().describe("Grade for the subject"),
    })
  )
  .nonempty("Marks data cannot be empty")
  .describe("Array of subjects with their marks and ID mappings");

export type MarksData = z.infer<typeof marksDataSchema>;

export const teacherRemarkSchema = z
  .object({
    comment: z.string().nullable().describe("Teacher's remark/comment, or null if none"),
    note: z.string().nullable().describe("Optional note about the remark presence/absence"),
  })
  .describe("Teacher's remark section");
export type TeacherRemark = z.infer<typeof teacherRemarkSchema>;

export const resultInputSchema = z
  .object({
    studentData: studentDataSchema,
    marksData: marksDataSchema,
    teachersRemark: teacherRemarkSchema,
    studentRatings: studentRatingsSchema.nullable().describe("Student's ratings for various attributes"),
  })
  .describe("Schema for a student report card with proper ID mappings");
export type ResultInput = z.infer<typeof resultInputSchema>;



export const marksIputSchema = z.object({
  subjectId: z.number(),
  examTypeId: z.number(),
  totalMarks: z.number(),
  grade: z.string().nullable(),
  gpa: z.number().nullable(),
  isAbsent: z.boolean(),
  teacherRemarks: z.string().optional(),
});
export type MarksInput = z.infer<typeof marksIputSchema>;

export const markResponseSchema = z.object({
  studentId: z.number(),
  examTypeId: z.number(),
  results: z.array(marksIputSchema),
});

export type MarkResponse = z.infer<typeof markResponseSchema> & { extra?: any };
