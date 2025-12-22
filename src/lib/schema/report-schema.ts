import z from "zod";

export const schoolSchema = z.object({
  name: z.string("School name is required"),
  logo: z.string("School logo is required"),
  city: z.string("School city is required"),
  state: z.string("School state is required"),
  title: z.string("School title is required"),
  vacation_date: z.string("School vacation date is required"),
});

export const studentSchema = z.object({
  id: z.number("Student ID is required"),
  examId: z.number("Exam ID is required"),
  fullName: z.string("Student full name is required"),
  gender: z.string("Student gender is required"),
  parentEmail: z.string("Parent email is required"),
  parentName: z.string("Parent name is required"),
  term: z.string("Term is required"),
  title: z.string("Title is required"),
  category: z.enum(
    ["DAYCARE", "NURSERY", "GRADEK", "LOWERBASIC", "MIDDLEBASIC"],
    "Student category is required"
  ),
  className: z.string("Class name is required"),
  sectionName: z.string("Section name is required"),
  adminNo: z.number("Admission number is required"),
  sessionYear: z.string("Session year is required"),
  opened: z.number("Number of days opened is required"),
  absent: z.number("Number of days absent is required"),
  present: z.number("Number of days present is required"),
  studentPhoto: z.string("Student photo is required"),
  token: z.string("Token is required"),
});

// Define different record schemas based on category with custom error messages
const daycareRecordSchema = z.object({
  subjectId: z.number("Subject ID is required for daycare records"),
  subject: z.string("Subject name is required for daycare records"),
  subjectCode: z.string("Subject code is required for daycare records"),
  learningOutcome: z.string("Learning outcome is required for daycare records"), // Specific to DAYCARE
});

const nurseryRecordSchema = z.object({
  subjectId: z.number("Subject ID is required for nursery records"),
  subject: z.string("Subject name is required for nursery records"),
  subjectCode: z.string("Subject code is required for nursery records"),
  objectives: z.array(z.string()).min(1, { message: "Objectives are required for nursery records" }),
  titles: z
    .array(z.string())
    .refine(
      (titles) =>
        titles.length > 0 && titles.every((title) => ["MTA", "CA", "PSYCHO", "ORAL", "EXAM"].includes(title)),
      {
        message: "NURSERY titles must be one of: MTA, CA, PSYCHO, ORAL, EXAM",
      }
    ),
  marks: z.array(z.number()).min(1, { message: "Marks are required for nursery records" }),
  totalScore: z.number("Total score is required for nursery records"),
  grade: z.string("Grade is required for nursery records"),
  color: z.string("Color is required for nursery records"),
});

const gradeKToMiddleBasicRecordSchema = z.object({
  subjectId: z.number("Subject ID is required for grade K to middle basic records"),
  subject: z.string("Subject name is required for grade K to middle basic records"),
  subjectCode: z.string("Subject code is required for grade K to middle basic records"),
  objectives: z
    .array(z.string())
    .min(1, { message: "Objectives are required for grade K to middle basic records" }),
  titles: z
    .array(z.string())
    .refine(
      (titles) =>
        titles.length > 0 && titles.every((title) => ["MTA", "CA", "REPORT", "EXAM"].includes(title)),
      {
        message: "GRADEK, LOWERBASIC, and MIDDLEBASIC titles must be one of: MTA, CA, REPORT, EXAM",
      }
    ),
  marks: z.array(z.number()).min(1, { message: "Marks are required for grade K to middle basic records" }),
  totalScore: z.number("Total score is required for grade K to middle basic records"),
  grade: z.string("Grade is required for grade K to middle basic records"),
  color: z.string("Color is required for grade K to middle basic records"),
});

// Function to determine the appropriate record schema based on category
export const getRecordSchemaByCategory = (category: string) => {
  switch (category) {
    case "DAYCARE":
      return daycareRecordSchema;
    case "NURSERY":
      return nurseryRecordSchema;
    case "GRADEK":
    case "LOWERBASIC":
    case "MIDDLEBASIC":
      return gradeKToMiddleBasicRecordSchema;
    default:
      return gradeKToMiddleBasicRecordSchema; // Default to the general schema
  }
};

// Since Zod doesn't support runtime schema selection directly in object definitions,
// we'll create a union schema that covers all possibilities
export const recordSchema = z.union([
  daycareRecordSchema,
  nurseryRecordSchema,
  gradeKToMiddleBasicRecordSchema,
]);

export const scoreSchema = z.object({
  total: z.number("Total score is required"),
  average: z.number("Average score is required"),
  classAverage: z.object({
    min: z.object({
      studentId: z.number("Minimum student ID is required"),
      value: z.string("Minimum value is required"),
    }),
    max: z.object({
      studentId: z.number("Maximum student ID is required"),
      value: z.string("Maximum value is required"),
    }),
  }),
  maxScores: z.number("Maximum scores is required"),
});

export const ratingSchema = z.array(
  z.object({
    attribute: z.string("Rating attribute is required"),
    rate: z.number("Rating value is required"),
    remark: z.string("Rating remark is required"),
    color: z.string("Rating color is required"),
  })
);

export const remarkSchema = z.object({
  remark: z.string("Teacher's remark is required"),
});

export const reportSchema = z.object({
  school: schoolSchema,
  student: studentSchema,
  records: z.array(recordSchema, "Records are required"),
  score: scoreSchema,
  ratings: ratingSchema,
  remark: remarkSchema,
});

export type ReportData = z.infer<typeof reportSchema>;
