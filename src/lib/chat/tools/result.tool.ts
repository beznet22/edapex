import z from "zod";
import { tool, type InferToolInput, type InferToolOutput } from "ai";
import { attendanceSchema, resultInputSchema, resultOutputSchema, studentRatingsSchema, teacherRemarkSchema } from "$lib/schema/result";
import { result } from "$lib/server/service/result.service";
import { studentRepo } from "$lib/server/repository/student.repo";

export const upsertStudentResult = tool({
  description: [
    "Retrieves, creates, or update student assessment data for head teacher review",
    "ALWAYS requires studentId and examTypeId provided in CONVERSATION CONTEXT to identify the record",
    "When updating (update=true): provide complete marksData object with modifications",
    "When retrieving (update=false/default): returns existing result data and PDF generation link",
    "Output includes pdfUrl formatted as '/generate?id={studentId}&examId={examTypeId}'",
  ].join("\n"),
  inputSchema: z
    .object({
      studentId: z.number().describe("The Student ID - REQUIRED for all operations"),
      examTypeId: z.number().describe("The Exam Type ID - REQUIRED for all operations"),
      adminNo: z
        .number()
        .optional()
        .describe("The Student Admission Number - REQUIRED if studentId is not provided"),
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
    const { studentId, examTypeId, operation, marksData, adminNo } = input;
    if (operation === "create" || operation === "update") {
      if (!marksData) {
        return {
          status: "denied",
          message: "Marks data is required for create or update operation",
        };
      }
     const res = await result.upsertStudentResult(marksData, 1);
     if (!res.success) {
        return {
          status: "denied",
          message: res.message,
        };
      }
    }

    const resultData = adminNo
      ? await result.getStudentResult({ isAdminNo: true, examId: examTypeId, id: adminNo })
      : await result.getStudentResult({ id: studentId, examId: examTypeId });

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
});

export const upsertAttendance = tool({
  description: [
    "Creates, or update student attendance data for head teacher review",
    "ALWAYS requires studentId and examTypeId provided in CONVERSATION CONTEXT to identify the record",
    "When updating (update=true): provide complete attendanceData object with modifications",
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
      attendanceData: attendanceSchema
        .optional()
        .describe("Student attendance data - REQUIRED only when update=true"),
    })
    .refine((data) => {
      if (data.operation === "create" && !data.attendanceData) {
        return false;
      }
      if (data.operation === "update" && !data.attendanceData) {
        return false;
      }
      return true;
    }),
  outputSchema: z.object({
    status: z
      .enum(["approved", "denied"])
      .describe("Operation status: 'approved' if successful, 'denied' if record not found"),
    message: z
      .string()
      .optional()
      .describe("Status details (e.g., 'Attendance retrieved', 'Attendance updated')"),
  }),
  execute: async (input) => {
    const { studentId, examTypeId, operation, attendanceData } = input;
    if (operation === "create" || operation === "update") {
      if (!attendanceData) {
        return {
          status: "denied",
          message: "Attendance data is required for create or update operation",
        };
      }
      await result.upsertAttendance({ attendance: attendanceData, studentId, examTypeId });
    }
    return {
      status: "approved",
      message: "Attendance data retrieved",
    };
  },
});

export const upsertTeacherRemark = tool({
  description: [
    "Creates, or update teacher's remark for a student for head teacher review",
    "ALWAYS requires studentId and examTypeId provided in CONVERSATION CONTEXT to identify the record",
    "When updating (update=true): provide complete remarkData object with modifications",
    "When retrieving (update=false/default): returns existing remark data",
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
      remarkData: teacherRemarkSchema
        .optional()
        .describe("Teacher's remark data - REQUIRED only when update=true"),
    })
    .refine((data) => {
      if (data.operation === "create" && !data.remarkData) {
        return false;
      }
      if (data.operation === "update" && !data.remarkData) {
        return false;
      }
      return true;
    }),
  outputSchema: z.object({
    status: z
      .enum(["approved", "denied"])
      .describe("Operation status: 'approved' if successful, 'denied' if record not found"),
    message: z.string().optional().describe("Status details (e.g., 'Remark retrieved', 'Remark updated')"),
  }),
  execute: async (input) => {
    const { studentId, examTypeId, operation, remarkData } = input;
    if (operation === "create" || operation === "update") {
      if (!remarkData) {
        return {
          status: "denied",
          message: "Remark data is required for create or update operation",
        };
      }
      await result.upsertTeacherRemark({
        studentId,
        examTypeId,
        remark: remarkData.comment!,
      });
    }
    return {
      status: "approved",
      message: "Remark data retrieved",
    };
  },
});

export const upsertStudentRatings = tool({
  description: [
    "Creates, or update student ratings for head teacher review",
    "ALWAYS requires studentId and examTypeId provided in CONVERSATION CONTEXT to identify the record",
    "When updating (update=true): provide complete ratingsData object with modifications",
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
      ratingsData: studentRatingsSchema
        .optional()
        .describe("Student ratings data - REQUIRED only when update=true"),
    })
    .refine((data) => {
      if (data.operation === "create" && !data.ratingsData) {
        return false;
      }
      if (data.operation === "update" && !data.ratingsData) {
        return false;
      }
      return true;
    }),
  outputSchema: z.object({
    status: z
      .enum(["approved", "denied"])
      .describe("Operation status: 'approved' if successful, 'denied' if record not found"),
    message: z.string().optional().describe("Status details (e.g., 'Ratings retrieved', 'Ratings updated')"),
  }),
  execute: async (input) => {
    const { studentId, examTypeId, operation, ratingsData } = input;
    if (operation === "create" || operation === "update") {
      if (!ratingsData) {
        return {
          status: "denied",
          message: "Ratings data is required for create or update operation",
        };
      }
      await result.upsertStudentRatings({
        studentId,
        examTypeId,
        ratings: ratingsData,
      });
    }
    return {
      status: "approved",
      message: "Ratings data retrieved",
    };
  },
});

export type upsertTeacherRemarkInput = InferToolInput<typeof upsertTeacherRemark>;
export type upsertTeacherRemarkOutput = InferToolOutput<typeof upsertTeacherRemark>;
export type upsertAttendanceInput = InferToolInput<typeof upsertAttendance>;
export type upsertAttendanceOutput = InferToolOutput<typeof upsertAttendance>;
export type upsertResultInput = InferToolInput<typeof upsertStudentResult>;
export type upsertResultOutput = InferToolOutput<typeof upsertStudentResult>;
