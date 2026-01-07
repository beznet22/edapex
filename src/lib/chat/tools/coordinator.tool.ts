import { marksIputSchema } from "$lib/schema/result-input";
import { resultOutputSchema, type Category } from "$lib/schema/result-output";
import { resultRepo } from "$lib/server/repository/result.repo";
import { studentRepo } from "$lib/server/repository/student.repo";
import { result } from "$lib/server/service/result.service";
import { CATEGORY } from "$lib/types/sms-types";
import { tool } from "ai";
import { base64url } from "jose";
import z, { record } from "zod";

export const validateClassResults = tool({
  description: [
    "Validates student results for a specific class and exam type.",
    "Checks if results exist and conform to the required schema.",
    "Returns a summary of valid/invalid results and a list of students with issues.",
    "Use this before sending results.",
  ].join("\n"),
  inputSchema: z.object({
    classId: z.number().describe("The Class ID to validate results for."),
    sectionId: z.number().describe("Section ID to filter students."),
    examTypeId: z.number().describe("The Exam Type ID to validate results for."),
  }),
  outputSchema: z.object({
    totalStudents: z.number(),
    validCount: z.number(),
    invalidCount: z.number(),
    resultStatus: z
      .array(
        z.object({
          studentId: z.number(),
          name: z.string(),
          admissionNo: z.number(),
          issues: z.array(z.string()),
          valid: z.boolean(),
          token: z.string().optional(),
        })
      )
      .describe("List of students with invalid or missing results."),
    message: z.string(),
  }),
  execute: async ({ classId, sectionId, examTypeId }) => {
    const students = await studentRepo.getStudentsByClassId({ classId, sectionId });

    if (!students || students.length === 0) {
      return {
        totalStudents: 0,
        validCount: 0,
        invalidCount: 0,
        resultStatus: [],
        message: "No students found in this class/section.",
      };
    }

    let validCount = 0;
    let invalidCount = 0;
    const resultStatus: {
      studentId: number;
      name: string;
      admissionNo: number;
      issues: string[];
      valid: boolean;
      token?: string;
    }[] = [];

    for (const student of students) {
      const resultData = await result.getStudentResult({
        id: student.id,
        examId: examTypeId,
      });

      const issues: string[] = [];
      if (!resultData) {
        issues.push("Result not found (missing data).");
      } else {
        const parsed = await resultOutputSchema.safeParseAsync(resultData);
        if (!parsed.success) {
          issues.push(
            ...parsed.error.issues.map((e: z.core.$ZodIssue) => `${e.path.join(".")}: ${e.message}`)
          );
        }
      }

      if (issues.length > 0) {
        invalidCount++;
        resultStatus.push({
          studentId: student.id,
          name: student.name || "Unknown",
          admissionNo: student.admissionNo || 0,
          issues,
          valid: false,
        });
      } else {
        validCount++;
        resultStatus.push({
          studentId: student.id,
          name: student.name || "Unknown",
          admissionNo: student.admissionNo || 0,
          issues: [],
          valid: true,
          token: base64url.encode(JSON.stringify({ studentId: student.id, examId: examTypeId })),
        });
      }
    }
    return {
      totalStudents: students.length,
      validCount,
      invalidCount,
      resultStatus,
      message: `Validation complete. ${validCount} valid, ${invalidCount} invalid.`,
    };
  },
});

export const sendStudentResult = tool({
  description: [
    "Sends/Publishes a single student result via email.",
    "Marks the result as published in the student timeline.",
    "Should be called only after validation is successful or deemed acceptable.",
    "Returns detailed error information if sending fails - explain errors to user in simple terms.",
  ].join("\n"),
  inputSchema: z.object({
    studentId: z.number().describe("The Student ID."),
    examTypeId: z.number().describe("The Exam Type ID."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    errors: z.array(z.string()).optional().describe("Detailed error messages if any"),
  }),
  execute: async ({ studentId, examTypeId }) => {
    const response = await result.publishResults({ studentIds: [studentId], examId: examTypeId });

    if (!response.success) {
      return {
        success: false,
        message: `Failed to send result for student ${studentId}. ${response.failed} failed.`,
        errors: response.errors,
      };
    }

    return {
      success: true,
      message: `Result sent successfully for student ${studentId}.`,
      errors: response.errors.length > 0 ? response.errors : undefined,
    };
  },
});

export const sendClassResults = tool({
  description: [
    "Sends/Publishes results for a class via email.",
    "Marks the result as published in the student timeline.",
    "Should be called only after validation is successful or deemed acceptable.",
    "Returns detailed error information if sending fails - explain errors to user in simple terms.",
  ].join("\n"),
  inputSchema: z.object({
    classId: z.number().describe("The Class ID."),
    sectionId: z.number().describe("Optional Section ID."),
    examTypeId: z.number().describe("The Exam Type ID."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    sent: z.number().optional().describe("Number of results successfully sent"),
    failed: z.number().optional().describe("Number of results that failed to send"),
    errors: z.array(z.string()).optional().describe("Detailed error messages if any"),
  }),
  execute: async ({ classId, examTypeId, sectionId }) => {
    const students = await studentRepo.getStudentsByClassId({ classId, sectionId });
    if (!students || students.length === 0) {
      return { success: false, message: "No students found." };
    }

    const response = await result.publishResults({
      studentIds: students.map((s) => s.id),
      examId: examTypeId,
    });

    if (!response.success) {
      return {
        success: false,
        message: `Failed to send results. ${response.sent} sent, ${response.failed} failed.`,
        sent: response.sent,
        failed: response.failed,
        errors: response.errors,
      };
    }

    return {
      success: true,
      message: `Results sent successfully. ${response.sent} sent, ${response.failed} failed.`,
      sent: response.sent,
      failed: response.failed,
      errors: response.errors.length > 0 ? response.errors : undefined,
    };
  },
});

export const getStudentList = tool({
  description:
    "Retrieves a list of all students assigned to a specific staff member. Returns student IDs, names, and admission numbers. Essential when 'studentId' or 'admissionNo' is unknown.",
  inputSchema: z.object({
    classId: z.number().describe("The unique ID of the class."),
    sectionId: z.number().describe("Section ID."),
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
  execute: async ({ classId, sectionId }) => {
    const students = await studentRepo.getStudentsByClassId({ classId, sectionId });
    return {
      students: students || [],
    };
  },
});

export const changeStudentName = tool({
  description: "Changes the name of a student.",
  inputSchema: z.object({
    studentId: z.number().describe("The unique ID of the student."),
    name: z.string().describe("The new name of the student."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ studentId, name }) => {
    const student = await studentRepo.getStudentById(studentId);
    if (!student) {
      return { success: false, message: "Student not found." };
    }
    student.fullName = name;
    await studentRepo.updateStudent(student);
    return { success: true, message: "Student name updated successfully." };
  },
});

export const updateExamTitle = tool({
  description: "Updates the exam title for a specific exam type.",
  inputSchema: z.object({
    classId: z.number().describe("The unique ID of the class."),
    sectionId: z.number().describe("The unique ID of the section."),
    examTypeId: z.number().describe("The unique ID of the exam type."),
    newExamTitles: z.array(z.string()).describe("The new exam title to be updated."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ classId, sectionId, examTypeId, newExamTitles }) => {
    const affectedRows = await resultRepo.updateExamSetup({
      examTitles: newExamTitles,
      classId,
      sectionId,
      examTermId: examTypeId,
      schoolId: 1,
    });

    return { success: true, message: `Exam setup updated successfully. Affected rows: ${affectedRows}` };
  },
});

export const upsertMarkStore = tool({
  description: "Updates the mark store for a specific subject and exam type.",
  inputSchema: z.object({
    classId: z.number().describe("The unique ID of the class. required"),
    sectionId: z.number().describe("The unique ID of the section. required"),
    studentId: z.number().describe("The unique ID of the student. required"),
    examTypeId: z.number().describe("The unique ID of the exam type. required"),
    subjectId: z.number().describe("The unique ID of the subject. required"),
    subjectCode: z.string().describe("The subject code to be updated. required"),
    newMarks: z.array(z.number()).describe("The new mark to be updated. required"),
    titles: z.array(z.string()).describe("The new title to be updated. required"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("The success status. required"),
    message: z.string().describe("The message to be returned. required"),
    data: z.array(marksIputSchema).optional().describe("The process mark to be updated. optional"),
  }),
  execute: async ({
    classId,
    sectionId,
    studentId,
    examTypeId,
    subjectId,
    subjectCode,
    newMarks,
    titles,
  }) => {
    const examSetups = await resultRepo.getExamSetup({
      classId,
      sectionId,
      examTypeId,
      subjectId,
      schoolId: 1,
    });

    if (!examSetups || examSetups.length === 0) {
      return { success: false, message: "Exam setup not found." };
    }

    const studentRecord = await studentRepo.getStudentRecord({
      classId,
      sectionId,
      studentId,
    });
    if (!studentRecord) {
      return { success: false, message: "Student not found." };
    }

    const processMark = await result.doProcessMarks(
      {
        category: CATEGORY[studentRecord.categoryId ?? 0] as Category,
        studentId,
        recordId: studentRecord.id,
        classId,
        sectionId,
        schoolId: 1,
        examTypeId,
      },
      [
        {
          subjectId,
          subjectCode,
          marks: newMarks,
          examTitles: titles,
        },
      ],
      examSetups
    );
    if (!processMark) {
      return { success: false, message: "Mark store update failed." };
    }

    return { success: true, message: `Mark store updated successfully`, data: processMark };
  },
});

export const getStudentRegistrationOptions = tool({
  description: [
    "Retrieves all available options for student registration.",
    "ALWAYS call this tool FIRST before collecting student registration information.",
    "Returns lists of classes, sections, student categories, genders, and guardian relations.",
    "Use these options to present choices to the user when registering a new student.",
  ].join("\n"),
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the operation was successful."),
    classes: z
      .array(z.object({ id: z.number(), name: z.string() }))
      .describe("Available classes with their IDs and names."),
    sections: z
      .array(z.object({ id: z.number(), name: z.string().nullable() }))
      .describe("Available sections with their IDs and names."),
    categories: z
      .array(z.object({ id: z.number(), name: z.string().nullable() }))
      .describe("Available student categories (e.g., Day Student, Boarder)."),
    genders: z
      .array(z.object({ id: z.number(), name: z.string() }))
      .describe("Available genders with their IDs and names."),
    guardianRelations: z
      .array(z.object({ value: z.string(), label: z.string() }))
      .describe("Available guardian relations (father, mother, other)."),
  }),
  execute: async () => {
    try {
      const options = await studentRepo.getStudentRegistrationOptions();
      return {
        success: true,
        ...options,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        classes: [],
        sections: [],
        categories: [],
        genders: [],
        guardianRelations: [],
        message: `Failed to fetch registration options: ${errorMessage}`,
      };
    }
  },
});

export const createStudent = tool({
  description: [
    "Creates a new student record with all required related data (user account, parent/guardian, student record, class enrollment).",
    "IMPORTANT: Before calling this tool, you MUST first call 'getStudentRegistrationOptions' to get available classes, sections, categories, genders, and guardian relations.",
    "If admissionNo is provided and a student with that admission number already exists, returns the existing student.",
    "",
    "## Required Fields:",
    "- **firstName** (string): The student's first name",
    "- **lastName** (string): The student's last name",
    "- **classId** (number): The ID of the class to enroll the student in",
    "- **sectionId** (number): The ID of the section within the class",
    "- **genderId** (number): Gender ID from the options (call getStudentRegistrationOptions first)",
    "- **studentCategoryId** (number): Student category ID (call getStudentRegistrationOptions first)",
    "- **guardianRelation** (string): 'father', 'mother', or 'other' - determines which parent field is populated",
    "- **guardiansName** (string): Name of the parent/guardian (if father, also sets fathersName; if mother, also sets mothersName)",
    "- **guardiansMobile** (string): Guardian's phone number - REQUIRED for communication",
    "- **guardiansEmail** (string): Guardian's email address - REQUIRED for communication",
    "",
    "## Optional Fields:",
    "- **admissionNo** (number): Unique admission number - if provided, checks for existing student first",
    "- **email** (string): Student's email address",
    "- **mobile** (string): Student's mobile/phone number",
    "- **dateOfBirth** (string): Date of birth in 'YYYY-MM-DD' format",
    "- **schoolId** (number): School ID (defaults to 1)",
    "- **academicId** (number): Academic year ID (auto-fetched if not provided)",
  ].join("\n"),
  inputSchema: z.object({
    // Required fields
    firstName: z.string().describe("The student's first name. REQUIRED."),
    lastName: z.string().describe("The student's last name. REQUIRED."),
    classId: z.number().describe("The ID of the class to enroll the student. REQUIRED."),
    sectionId: z.number().describe("The ID of the section within the class. REQUIRED."),
    genderId: z.number().describe("Gender ID from registration options. REQUIRED."),
    studentCategoryId: z.number().describe("Student category ID from registration options. REQUIRED."),
    guardianRelation: z
      .enum(["father", "mother", "other"])
      .describe("Guardian relation: 'father', 'mother', or 'other'. REQUIRED."),
    guardiansName: z.string().describe("Name of the parent/guardian. REQUIRED."),
    guardiansMobile: z.string().describe("Guardian's phone number. REQUIRED for communication."),
    guardiansEmail: z.string().describe("Guardian's email address. REQUIRED for communication."),
    // Optional fields
    admissionNo: z
      .number()
      .optional()
      .describe("Unique admission number. If provided, checks for existing student first."),
    email: z.string().optional().describe("Student's email address."),
    mobile: z.string().optional().describe("Student's mobile/phone number."),
    dateOfBirth: z.string().optional().describe("Date of birth in 'YYYY-MM-DD' format."),
    schoolId: z.number().optional().describe("School ID. Defaults to 1."),
    academicId: z.number().optional().describe("Academic year ID. Auto-fetched if not provided."),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the operation was successful."),
    message: z.string().describe("A message describing the result."),
    isExisting: z.boolean().describe("True if the student already existed, false if newly created."),
    student: z
      .object({
        id: z.number().describe("The student's unique ID."),
        admissionNo: z.number().nullable().describe("The student's admission number."),
        fullName: z.string().nullable().describe("The student's full name."),
        classId: z.number().nullable().describe("The class ID."),
        sectionId: z.number().nullable().describe("The section ID."),
      })
      .optional()
      .describe("The created or existing student record."),
  }),
  execute: async (input) => {
    try {
      const student = await studentRepo.creatStudentIfNotExists(input);

      if (!student) {
        return {
          success: false,
          message: "Failed to create student. Please check the input data and try again.",
          isExisting: false,
        };
      }

      const fullName = `${input.firstName} ${input.lastName}`.trim();

      // Check if this was an existing student (only possible if admissionNo was provided)
      const isExisting =
        input.admissionNo !== undefined &&
        student.admissionNo === input.admissionNo &&
        student.fullName !== fullName;

      return {
        success: true,
        message: isExisting
          ? `Student with admission number ${input.admissionNo} already exists.`
          : `Student "${fullName}" created successfully with ID ${student.id}.`,
        isExisting,
        student: {
          id: student.id,
          admissionNo: student.admissionNo,
          fullName: student.fullName,
          classId: student.classId,
          sectionId: student.sectionId,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        message: `Failed to create student: ${errorMessage}`,
        isExisting: false,
      };
    }
  },
});
