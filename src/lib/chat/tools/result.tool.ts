import z from "zod";
import { tool, type InferToolInput, type InferToolOutput } from "ai";
import { resultInputSchema, resultOutputSchema } from "$lib/schema/result";
import { result } from "$lib/server/service/result.service";
import { studentRepo } from "$lib/server/repository/student.repo";

export const upsertStudentResult = tool({
  description: [
    "Retrieves, creates, or update student assessment data for head teacher review",
    "ALWAYS requires studentId and examTypeId to identify the record",
    "When updating (update=true): provide complete marksData object with modifications",
    "When retrieving (update=false/default): returns existing result data and PDF generation link",
    "Output includes pdfUrl formatted as '/generate?id={studentId}&examId={examTypeId}'",
  ].join("\n"),
  inputSchema: z
    .object({
      studentId: z.number().describe("The Student ID - REQUIRED for all operations"),
      examTypeId: z.number().describe("The Exam Type ID - REQUIRED for all operations"),
      operation: z
        .enum(["create", "update", "read"])
        .default("read")
        .describe(
          "Operation to perform: 'create' to create a new record, 'update' to update an existing record, 'read' to retrieve an existing record"
        ),
      marksData: resultInputSchema
        .optional()
        .describe("COMPLETE student marks object - REQUIRED only when update=true"),
    })
    .refine((data) => {
      if (data.operation === "create" && !data.marksData) {
        return false;
      }
      if (data.operation === "update" && !data.marksData) {
        return false;
      }
      return true;
    }),
  outputSchema: z.object({
    status: z
      .enum(["approved", "denied"])
      .describe("Operation status: 'approved' if successful, 'denied' if record not found"),
    message: z.string().optional().describe("Status details (e.g., 'Result retrieved', 'Result updated')"),
    data: resultOutputSchema
      .optional()
      .describe("Structured student assessment data for head teacher review"),
  }),
  execute: async (input) => {
    const { studentId, examTypeId, operation, marksData } = input;
    if (operation === "create" || operation === "update") {
      if (!marksData) {
        return {
          status: "denied",
          message: "Marks data is required for create or update operation",
        };
      }
      await result.upsertStudentResult(marksData, 1);
    }

    const resultData = await result.getStudentResult(studentId, examTypeId);
    if (!resultData) {
      return {
        status: "denied",
        message: `No assessment record found for student ${studentId} and exam type ${examTypeId}`,
      };
    }

    return {
      status: "approved",
      message: "Assessment data retrieved",
      data: resultData,
    };
  },
});

export const getClassStudentList = tool({
  description: [
    "Retrieves a list of students in a class by using User ID, returns empty array if no students found",
  ].join("\n"),
  inputSchema: z.object({
    userId: z.number().describe("The User ID - REQUIRED to retrieve student list"),
  }),
  outputSchema: z.object({
    students: z
      .array(
        z.object({
          id: z.number().describe("The Student ID"),
          name: z.string().describe("The Student Name"),
          admissionNo: z.number().describe("The Student Admission Number"),
        })
      )
      .describe("List of students in the class"),
  }),
  execute: async (input) => {
    const students = await studentRepo.getStudentsByUserId(input.userId);
    return {
      students: students || [],
    };
  },
})

export type upsertResultInput = InferToolInput<typeof upsertStudentResult>;
export type upsertResultOutput = InferToolOutput<typeof upsertStudentResult>;
