import { resultRepo } from "$lib/server/repository/result.repo";
import { result } from "$lib/server/service/result.service";
import { z } from "zod";

export const categoryEnum = z.enum(["DAYCARE", "NURSERY", "GRADEK", "LOWERBASIC", "MIDDLEBASIC"]);
export type Category = z.infer<typeof categoryEnum>;

const TITLES_BY_CATEGORY: Record<Category, readonly string[]> = {
  DAYCARE: [],
  GRADEK: ["CA1", "CA2", "HW", "REPORT", "PSYCHO", "EXAM"],
  LOWERBASIC: ["MTA", "CA", "REPORT", "EXAM"],
  MIDDLEBASIC: ["MTA", "CA", "REPORT", "EXAM"],
  NURSERY: ["HW", "CA", "PSYCHO", "ORAL", "EXAM"],
};

export const schoolSchema = z.object({
  id: z.number().describe("The ID of the school"),
  name: z.string().describe("The name of the school"),
  email: z.string().describe("The email of the school"),
  phone: z.string().describe("The phone of the school"),
  logo: z.string().optional().describe("The base64 encoded logo of the school"),
  city: z.string().describe("The city of the school"),
  state: z.string().describe("The state of the school"),
  title: z.string().describe("The title of the school"),
  vacation_date: z.string().describe("The vacation date of the school"),
});
export type School = z.infer<typeof schoolSchema>;

export const studentSchema = z.object({
  id: z.number().describe("The ID of the student"),
  examId: z.number().describe("The ID of the exam"),
  fullName: z.string().describe("The full name of the student"),
  gender: z.string().describe("The gender of the student"),
  parentEmail: z.string().describe("The parent email of the student"),
  parentName: z.string().describe("The parent name of the student"),
  term: z.string().describe("The term of the exam"),
  title: z.string().describe("The title of the exam"),
  category: z
    .enum(["DAYCARE", "NURSERY", "GRADEK", "LOWERBASIC", "MIDDLEBASIC"])
    .describe("The category of the student"),
  className: z.string().describe("The class name of the student"),
  sectionName: z.string().describe("The section name of the student"),
  adminNo: z.number().describe("The admission number of the student"),
  sessionYear: z.string().describe("The session year of the exam"),
  daysOpened: z.number().describe("The number of days opened"),
  daysAbsent: z.number().describe("The number of days absent"),
  daysPresent: z.number().describe("The number of days present"),
  studentPhoto: z.string().optional().describe("The base64 encoded photo of the student"),
  token: z
    .string()
    .describe(
      "The token for constructing the PDF download URL (e.g: http://localhost:3000/api/result/<token>)"
    ),
});
export type Student = z.infer<typeof studentSchema>;

export const recordSchema = z
  .object({
    resultId: z.number().describe("The ID of the result"),
    classId: z.number().describe("The ID of the class"),
    sectionId: z.number().describe("The ID of the section"),
    examTypeId: z.number().describe("The ID of the exam type"),
    subjectId: z.number().describe("The ID of the subject"),
    subject: z.string().describe("The name of the subject"),
    subjectCode: z.string().describe("The code of the subject"),
    objectives: z.array(z.string()).nullable().describe("The objectives of the subject"),
    titleIds: z.array(z.number()).default([]).describe("The IDs of the titles"),
    titles: z.array(z.string()).default([]).describe("The titles of the marks"),
    markIds: z.array(z.number()).default([]).describe("The IDs of the marks"),
    marks: z.array(z.number()).default([]).describe("The marks for the subject"),
    totalScore: z.number().describe("The total score for the subject"),
    grade: z.string().describe("The grade for the subject"),
    color: z.string().optional().describe("The color for the grade"),
    category: categoryEnum.describe("The category of the student"),
    learningOutcome: z.string().nullable().optional().describe("Learning outcome (ONLY for DAYCARE)"),
  })
  .superRefine(async (data, ctx) => {
    if (data.category !== "DAYCARE") {
      const allowedTitles = TITLES_BY_CATEGORY[data.category];
      if (data.titles.length !== allowedTitles.length) {
        ctx.addIssue({
          code: "custom",
          message: `Number of titles must match number of allowed titles for category ${data.category}`,
          path: ["titles"],
          meta: {
            allowedTitles,
            titles: data.titles,
            subjectId: data.subjectId,
            subjectCode: data.subjectCode,
          },
          continue: true,
        })
        // await result.cleanUpResultRecord(data);
      }
      if (data.marks.length !== data.titles.length) {
        ctx.addIssue({
          code: "custom",
          message: "Number of marks must match number of titles",
          path: ["marks"],
          continue: true,
        });
        // await result.cleanUpResultRecord(data);
      }
    }
    if (data.category === "DAYCARE") {
      if (data.titles.length > 0 || data.marks.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: "Titles and marks are not allowed for DAYCARE, must be empty",
          path: ["titles"],
          continue: true,
        });
        // await result.cleanUpResultRecord(data);
      }
      if (!data.learningOutcome) {
        ctx.addIssue({
          code: "custom",
          message: "Learning outcome is required for DAYCARE",
          path: ["learningOutcome"],
          continue: true,
        });
        // await result.cleanUpResultRecord(data);
      }
    }
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
}).optional();
export type Remark = z.infer<typeof remarkSchema>;

export const examType = z.object({
  id: z.number().describe("The ID of the exam type"),
  activeStatus: z.number().optional().describe("The active status of the exam type"),
  title: z.string().optional().describe("The title of the exam type"),
  isAverage: z.number().optional().describe("Whether the exam type is an average"),
  percentage: z.number().nullable().optional().describe("The percentage of the exam type"),
  averageMark: z.number().optional().describe("The average mark of the exam type"),
});
export type ExamType = z.infer<typeof examType>;

export const subjectAssignedSchema = z.object({
  subjectId: z.number().nullable().describe("The ID of the subject"),
  subjectCode: z.string().nullable().describe("The code of the subject"),
  teacherId: z.number().nullable().describe("The ID of the teacher"),
});
export type SubjectAssigned = z.infer<typeof subjectAssignedSchema>;

export const resultOutputSchema = z.object({
  school: schoolSchema,
  student: studentSchema,
  subjects: z.array(subjectAssignedSchema).nonempty(),
  records: z.array(recordSchema).nonempty(),
  score: scoreSchema,
  ratings: ratingSchema,
  remark: remarkSchema,
  examType: examType.optional(),
}).superRefine(async (data, ctx) => {
  if (data.records.length !== data.subjects.length) {
    ctx.addIssue({
      code: "custom",
      message: `Subjects records not complete, expected ${data.subjects.length} records, found ${data.records.length}`,
      path: ["records"],
      meta: {
        expected: data.subjects,
        found: data.records.map((record) => record.subjectId),
        missing: data.records.filter((record) => !data.subjects.find((subject) => subject.subjectId === record.subjectId)).map((record) => record.subjectId),
      },
      continue: true,
    });
  }
});

export type ResultOutput = z.infer<typeof resultOutputSchema> & { extra?: any };