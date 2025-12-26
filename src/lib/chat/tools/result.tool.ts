import z from "zod";
import { tool, type InferToolInput, type InferToolOutput } from "ai";
import {
  attendanceSchema,
  resultInputSchema,
  studentRatingsSchema,
  teacherRemarkSchema,
} from "$lib/schema/result-input";
import { result } from "$lib/server/service/result.service";
import { studentRepo } from "$lib/server/repository/student.repo";
import { resultOutputSchema } from "$lib/schema/result-output";

export const upsertStudentResult = tool({
  description: "Comprehensive tool for managing student academic results. Use 'read' to fetch existing scores and report data, 'create' to add new marks, and 'update' to modify existing marks. Requires 'studentId' and 'examTypeId'.",
  inputSchema: z
    .object({
      studentId: z.number().describe("The unique ID of the student."),
      examTypeId: z.number().describe("The unique ID of the exam type/term."),
      adminNo: z.number().optional().describe("Student Admission Number (fallback if Student ID is missing from CONVERSTION context)."),
      operation: z
        .enum(["create", "update", "read"])
        .default("read")
        .describe("Action to perform: 'read' to fetch, 'create' to add, 'update' to modify."),
      marksData: resultInputSchema.optional().describe("The structured marks data. Required only for 'create' or 'update' operations."),
    })
    .refine((data) => {
      if ((data.operation === "create" || data.operation === "update") && !data.marksData) {
        return false;
      }
      return true;
    }),
  outputSchema: z.object({
    status: z.enum(["approved", "denied"]).describe("Success status"),
    message: z.string().optional(),
    data: resultOutputSchema.optional().describe("Result data including records and summary"),
  }),
  execute: async (input) => {
    const { studentId, examTypeId, operation, marksData, adminNo } = input;
    if (operation === "create" || operation === "update") {
      if (!marksData) {
        return { status: "denied", message: "Marks data is required for create or update operation" };
      }
      try {
        const res = await result.upsertStudentResult(marksData, 1);
        if (!res) {
          return { status: "denied", message: "Failed to upsert student result" };
        }
      } catch (error) {
        return { status: "denied", message: "Failed to upsert student result" };
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
  description: "Retrieves a list of all students assigned to a specific staff member. Returns student IDs, names, and admission numbers. Essential when 'studentId' or 'admissionNo' is unknown.",
  inputSchema: z.object({
    staffId: z.number().describe("The unique ID of the staff member (teacher)."),
  }),
  outputSchema: z.object({
    students: z
      .array(
        z.object({
          id: z.number(),
          name: z.string(),
          admissionNo: z.number(),
        })
      )
      .describe("List of students"),
  }),
  execute: async (input) => {
    const students = await studentRepo.getStudentsByStaffId(input.staffId);
    return {
      students: students || [],
    };
  },
});

export const upsertAttendance = tool({
  description: "Manages student attendance records (days opened, present, and absent) for a specific exam term. Use 'read' to fetch, 'create' to add, or 'update' to modify.",
  inputSchema: z
    .object({
      studentId: z.number().describe("The unique ID of the student."),
      examTypeId: z.number().describe("The unique ID of the exam type/term."),
      operation: z
        .enum(["create", "update", "read"])
        .default("read")
        .describe("Action to perform: 'read' to fetch, 'create' to add, 'update' to modify."),
      attendanceData: attendanceSchema.optional().describe("Structured attendance data. Required only for 'create' or 'update' operations."),
    })
    .refine((data) => {
      if ((data.operation === "create" || data.operation === "update") && !data.attendanceData) {
        return false;
      }
      return true;
    }),
  outputSchema: z.object({
    status: z.enum(["approved", "denied"]),
    message: z.string().optional(),
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
      message: "Attendance data processed",
    };
  },
});

export const upsertTeacherRemark = tool({
  description: "Manages the teacher's qualitative comments and remarks for a student's performance in a specific exam term. Use 'read' to fetch, 'create' to add, or 'update' to modify.",
  inputSchema: z
    .object({
      studentId: z.number().describe("The unique ID of the student."),
      examTypeId: z.number().describe("The unique ID of the exam type/term."),
      operation: z
        .enum(["create", "update", "read"])
        .default("read")
        .describe("Action to perform: 'read' to fetch, 'create' to add, 'update' to modify."),
      remarkData: teacherRemarkSchema.optional().describe("Structured remark data containing the comment. Required only for 'create' or 'update' operations."),
    })
    .refine((data) => {
      if ((data.operation === "create" || data.operation === "update") && !data.remarkData) {
        return false;
      }
      return true;
    }),
  outputSchema: z.object({
    status: z.enum(["approved", "denied"]),
    message: z.string().optional(),
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
      message: "Remark data processed",
    };
  },
});

export const upsertStudentRatings = tool({
  description: "Manages student behavioral ratings (affective and psychomotor domains) for a specific exam term. Use 'read' to fetch, 'create' to add, or 'update' to modify.",
  inputSchema: z
    .object({
      studentId: z.number().describe("The unique ID of the student."),
      examTypeId: z.number().describe("The unique ID of the exam type/term."),
      operation: z
        .enum(["create", "update", "read"])
        .default("read")
        .describe("Action to perform: 'read' to fetch, 'create' to add, 'update' to modify."),
      ratingsData: studentRatingsSchema.optional().describe("Structured behavioral ratings. Required only for 'create' or 'update' operations."),
    })
    .refine((data) => {
      if ((data.operation === "create" || data.operation === "update") && !data.ratingsData) {
        return false;
      }
      return true;
    }),
  outputSchema: z.object({
    status: z.enum(["approved", "denied"]),
    message: z.string().optional(),
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
      message: "Ratings data processed",
    };
  },
});

export const publishResult = tool({
  description: "Publishes a student's result to their timeline and sends a notification email to parents. This finalizes the report card for the student for the specified exam.",
  inputSchema: z.object({
    studentId: z.number().describe("The unique ID of the student."),
    examTypeId: z.number().describe("The unique ID of the exam type/term."),
  }),
  outputSchema: z.object({
    status: z.enum(["approved", "denied"]),
    message: z.string().optional(),
  }),
  execute: async (input) => {
    const { studentId, examTypeId } = input;
    try {
      const res = await result.publishResult({ studentId, examId: examTypeId });
      if (!res) {
        return { status: "denied", message: "Failed to publish result. Ensure result is validated first." };
      }
      return { status: "approved", message: "Result published successfully and notification sent." };
    } catch (error) {
      return { status: "denied", message: "An error occurred while publishing the result." };
    }
  },
});

export type upsertTeacherRemarkInput = InferToolInput<typeof upsertTeacherRemark>;
export type upsertTeacherRemarkOutput = InferToolOutput<typeof upsertTeacherRemark>;
export type upsertAttendanceInput = InferToolInput<typeof upsertAttendance>;
export type upsertAttendanceOutput = InferToolOutput<typeof upsertAttendance>;
export type upsertResultInput = InferToolInput<typeof upsertStudentResult>;
export type upsertResultOutput = InferToolOutput<typeof upsertStudentResult>;
export type publishResultInput = InferToolInput<typeof publishResult>;
export type publishResultOutput = InferToolOutput<typeof publishResult>;
