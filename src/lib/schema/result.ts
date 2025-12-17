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

export const StudentCategory = ["DAYCARE", "NURSERY", "GRADEK	", "LOWERBASIC	", "MIDDLEBASIC"];

export enum DesignationEnum {
  Administrator = 1,
  Principal,
  HumanResource,
  IT,
  GradersCoordinator,
  EYFSCoodinator,
  Teacher,
}

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

export const studentDataSchema = z.object({
  studentId: z.number().int().positive().nullable().describe("Unique student ID"),
  admissionNo: z.number().int().positive().describe("Unique admission/enrolment number"),
  fullName: z.string().min(1, "Student full name required").describe("Full name of the student"),
  class: z
    .string()
    .describe("Assigned class, only class, section should not be included (e.g., GRADE KA becomes GRADE K)"),
  section: z.string().describe("Assigned section extracted from the class (e.g., A)"),
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
  attendance: z
    .object({
      daysOpened: z.number().int().nonnegative().describe("Total number of school days opened"),
      daysPresent: z.number().int().nonnegative().describe("Days the student was present"),
      daysAbsent: z.number().int().nonnegative().describe("Days the student was absent"),
    })
    .describe("Attendance details for the period"),
});
export type StudentData = z.infer<typeof studentDataSchema>;

export const marksDataSchema = z
  .array(
    z.object({
      subjectCode: z.string().min(1, "Subject code required").describe("Subject code (e.g., PSRN/QR)"),
      subjectId: z.number().int().positive().describe("Mapped subject ID from subjects mapping"),
      learningOutcome: z.string().optional().describe("Learning outcome (ONLY for DAYCARE)"),
      examTitles: z
        .array(z.string())
        .optional()
        .describe(
          "Array of string representing the actual names of the marks (e.g., CA1, CA2, HW, REPORT, PSYCHO, EXAM)"
        ),
      marks: z
        .array(z.number())
        .optional()
        .describe("Array of numbers representing the actual values of the marks (e.g., 20, 19, 2, 3, 4, 50)"),
      total: z.number().int().nonnegative().optional().describe("Total marks for the subject"),
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

export const schoolSchema = z.object({
  name: z.string().describe("The name of the school"),
  logo: z.string().optional().describe("The base64 encoded logo of the school"),
  city: z.string().describe("The city of the school"),
  state: z.string().describe("The state of the school"),
  title: z.string().describe("The title of the school"),
  vacation_date: z.string().describe("The vacation date of the school"),
});
export type SchoolData = z.infer<typeof schoolSchema>;

export const studentSchema = z.object({
  id: z.number().describe("The ID of the student"),
  examId: z.number().describe("The ID of the exam"),
  fullName: z.string().describe("The full name of the student"),
  gender: z.string().describe("The gender of the student"),
  parentEmail: z.string().describe("The parent email of the student"),
  parentName: z.string().describe("The parent name of the student"),
  term: z.string().describe("The term of the exam"),
  title: z.string().describe("The title of the exam"),
  category: z.enum(["DAYCARE", "NURSERY", "GRADEK", "LOWERBASIC", "MIDDLEBASIC"]).describe("The category of the student"),
  className: z.string().describe("The class name of the student"),
  sectionName: z.string().describe("The section name of the student"),
  adminNo: z.number().describe("The admission number of the student"),
  sessionYear: z.string().describe("The session year of the exam"),
  opened: z.number().describe("The number of days opened"),
  absent: z.number().describe("The number of days absent"),
  present: z.number().describe("The number of days present"),
  studentPhoto: z.string().optional().describe("The base64 encoded photo of the student"),
  token: z
    .string()
    .describe(
      "The token for constructing the PDF download URL (e.g: http://localhost:3000/api/result/<token>)"
    ),
});
export type Student = z.infer<typeof studentSchema>;

export const recordSchema = z.object({
  subjectId: z.number().describe("The ID of the subject"),
  subject: z.string().describe("The name of the subject"),
  subjectCode: z.string().describe("The code of the subject"),
  objectives: z.array(z.string()).nullable().describe("The objectives of the subject"),
  titles: z.array(z.string()).describe("The titles of the marks"),
  marks: z.array(z.number()).describe("The marks for the subject"),
  totalScore: z.number().describe("The total score for the subject"),
  grade: z.string().describe("The grade for the subject"),
  color: z.string().optional().describe("The color for the grade"),
});

export type MarksRecord = z.infer<typeof recordSchema>;

export const scoreSchema = z.object({
  total: z.number().describe("The total score for all subjects"),
  average: z.number().describe("The average score for all subjects"),
  classAverage: z
    .object({
      min: z.object({
        studentId: z.number().optional(),
        value: z.string().describe("The minimum average score for the class"),
      }),
      max: z.object({
        studentId: z.number().optional(),
        value: z.string().describe("The maximum average score for the class"),
      }),
    })
    .describe("The class average for all students"),
  maxScores: z.number().describe("The maximum possible score for all subjects"),
});
export type Score = z.infer<typeof scoreSchema>;

export const ratingSchema = z.array(
  z.object({
    attribute: z.string().nullable().describe("The attribute being rated"),
    rate: z.number().nullable().describe("The rating for the attribute"),
    remark: z.string().nullable().describe("The remark for the rating"),
    color: z.string().nullable().describe("The color for the rating"),
  })
);
export type Rating = z.infer<typeof ratingSchema>;

export const remarkSchema = z.object({
  remark: z.string().nullable().describe("The teacher's remark"),
});
export type Remark = z.infer<typeof remarkSchema>;

export const attendanceSchema = z.object({
  daysOpened: z.number().describe("The number of days school opened"),
  daysAbsent: z.number().describe("The number of days student was absent"),
  daysPresent: z.number().describe("The number of days student was present"),
});
export type Attendance = z.infer<typeof attendanceSchema>;

export const examType = z.object({
  id: z.number().describe("The ID of the exam type"),
  activeStatus: z.number().optional().describe("The active status of the exam type"),
  title: z.string().optional().describe("The title of the exam type"),
  isAverage: z.number().optional().describe("Whether the exam type is an average"),
  percentage: z.number().nullable().optional().describe("The percentage of the exam type"),
  averageMark: z.number().optional().describe("The average mark of the exam type"),
});
export type ExamType = z.infer<typeof examType>;

export const resultOutputSchema = z.object({
  school: schoolSchema,
  student: studentSchema,
  records: z.array(recordSchema),
  score: scoreSchema,
  ratings: ratingSchema,
  remark: remarkSchema,
  examType: examType.optional(),
});
export type ResultOutput = z.infer<typeof resultOutputSchema> & { extra?: any };

export const marksIputSchema = z.object({
  subjectId: z.number(),
  examId: z.number(),
  totalMarks: z.number(),
  grade: z.string().nullable(),
  gpa: z.number().nullable(),
  isAbsent: z.boolean(),
});
export type MarksInput = z.infer<typeof marksIputSchema>;

export const marksOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z
    .object({
      studentId: z.number(),
      examId: z.number(),
      results: z.array(marksIputSchema),
    })
    .optional(),
  errors: z.any().optional(),
});
export type MarksOutput = z.infer<typeof marksOutputSchema> & { extra?: any };
