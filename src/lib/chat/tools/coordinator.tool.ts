import { marksInputSchema } from "$lib/schema/result-input";
import { resultOutputSchema, type Category } from "$lib/schema/result-output";
import { resultRepo, studentRepo, staffRepo, parentRepo } from "$lib/server/repository";
import { assessment } from "$lib/server/service/assessment.service";

import { CATEGORY } from "$lib/types/sms-types";
import { tool, zodSchema, type InferToolInput, type InferToolOutput } from "ai";
import { base64url } from "jose";

import { z } from "zod";

export const validateClassResults = tool({
  description: [
    "Validates student results for a specific class and exam type.",
    "Checks if results exist and conform to the required schema.",
    "Returns a summary of valid/invalid results and a list of students with issues.",
    "Use this before sending results.",
  ].join("\n"),
  inputSchema: zodSchema(
    z.object({
      classId: z.number().describe("The Class ID to validate results for."),
      sectionId: z.number().describe("Section ID to filter students."),
      examTypeId: z.number().describe("The Exam Type ID to validate results for."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
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
    })
  ),
  execute: async ({ classId, sectionId, examTypeId }) => {
    const students = await studentRepo.getStudentsByClassSection({ classId, sectionId });

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
      const resultData = await assessment.getStudentResult({
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

export type ValidateClassResultsInput = InferToolInput<typeof validateClassResults>;
export type ValidateClassResultsOutput = InferToolOutput<typeof validateClassResults>;

// EmailResult schema matching email-job.ts interface
const emailResultSchema = z.object({
  to: z.string().optional().describe("Recipient email address"),
  messageId: z.string().optional().describe("Unique message ID from SMTP server"),
  response: z.string().optional().describe("SMTP server response (e.g., '250 OK')"),
  studentId: z.number().optional().describe("Student ID this email was sent for"),
});

export const sendStudentResult = tool({
  description: [
    "Sends/Publishes a single student result via email.",
    "Marks the result as published in the student timeline.",
    "Should be called only after validation is successful or deemed acceptable.",
    "Returns full SMTP result on success, or detailed error information on failure.",
  ].join("\n"),
  inputSchema: zodSchema(
    z.object({
      studentId: z.number().describe("The Student ID."),
      examTypeId: z.number().describe("The Exam Type ID."),
      resend: z
        .boolean()
        .optional()
        .describe("If true, resends the email even if it was previously sent. Default is false."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      success: z.boolean(),
      message: z.string(),
      result: emailResultSchema.optional().describe("SMTP result details on successful send"),
      errors: z.array(z.string()).optional().describe("Detailed error messages if sending failed"),
    })
  ),
  execute: async ({ studentId, examTypeId, resend }) => {
    const response = await assessment.publishResults({ studentIds: [studentId], examId: examTypeId, resend });

    if (!response.success) {
      return {
        success: false,
        message: `Failed to send result for student ${studentId}.`,
        errors: response.errors,
      };
    }

    return {
      success: true,
      message: `Result sent successfully for student ${studentId}.`,
      result: response.results[0],
    };
  },
});

export type SendStudentResultInput = InferToolInput<typeof sendStudentResult>;
export type SendStudentResultOutput = InferToolOutput<typeof sendStudentResult>;

export const sendClassResults = tool({
  description: [
    "Sends/Publishes results for a class via email.",
    "Marks the result as published in the student timeline.",
    "Should be called only after validation is successful or deemed acceptable.",
    "Returns full SMTP results on success, or detailed error information on failure.",
  ].join("\n"),
  inputSchema: zodSchema(
    z.object({
      classId: z.number().describe("The Class ID."),
      sectionId: z.number().describe("Optional Section ID."),
      examTypeId: z.number().describe("The Exam Type ID."),
      resend: z
        .boolean()
        .optional()
        .describe("If true, resends emails for students who already received them. Default is false."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      success: z.boolean(),
      message: z.string(),
      sent: z.number().optional().describe("Number of results successfully sent"),
      failed: z.number().optional().describe("Number of results that failed to send"),
      results: z.array(emailResultSchema).optional().describe("SMTP result details for each successful send"),
      errors: z.array(z.string()).optional().describe("Detailed error messages if sending failed"),
    })
  ),
  execute: async ({ classId, examTypeId, sectionId, resend }) => {
    const students = await studentRepo.getStudentsByClassSection({ classId, sectionId });
    if (!students || students.length === 0) {
      return { success: false, message: "No students found." };
    }

    const response = await assessment.publishResults({
      studentIds: students.map((s) => s.id),
      examId: examTypeId,
      resend,
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
      results: response.results.length > 0 ? response.results : undefined,
      errors: response.errors.length > 0 ? response.errors : undefined,
    };
  },
});

export type SendClassResultsInput = InferToolInput<typeof sendClassResults>;
export type SendClassResultsOutput = InferToolOutput<typeof sendClassResults>;

export const getStudentList = tool({
  description:
    "Retrieves a list of all students assigned to a specific staff member. Returns student IDs, names, and admission numbers. Essential when 'studentId' or 'admissionNo' is unknown.",
  inputSchema: zodSchema(
    z.object({
      classId: z.number().describe("The unique ID of the class."),
      sectionId: z.number().describe("Section ID."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      students: z
        .array(
          z.object({
            id: z.number(),
            name: z.string(),
            admissionNo: z.number(),
          })
        )
        .describe("List of students"),
    })
  ),
  execute: async ({ classId, sectionId }) => {
    const students = await studentRepo.getStudentsByClassSection({ classId, sectionId });
    return {
      students: students || [],
    };
  },
});

export type GetStudentListInput = InferToolInput<typeof getStudentList>;
export type GetStudentListOutput = InferToolOutput<typeof getStudentList>;

export const changeStudentName = tool({
  description: "Changes the name of a student. Use this tool when a student's name is misspelled or needs to be updated.",
  inputSchema: zodSchema(
    z.object({
      studentId: z.number().describe("The unique ID of the student."),
      name: z.string().describe("The new name of the student."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      success: z.boolean(),
      message: z.string(),
    })
  ),
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

export type ChangeStudentNameInput = InferToolInput<typeof changeStudentName>;
export type ChangeStudentNameOutput = InferToolOutput<typeof changeStudentName>;

export const updateExamTitle = tool({
  description: "Updates the exam title for a specific exam type.",
  inputSchema: zodSchema(
    z.object({
      classId: z.number().describe("The unique ID of the class."),
      sectionId: z.number().describe("The unique ID of the section."),
      examTypeId: z.number().describe("The unique ID of the exam type."),
      newExamTitles: z.array(z.string()).describe("The new exam title to be updated."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      success: z.boolean(),
      message: z.string(),
    })
  ),
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

export type UpdateExamTitleInput = InferToolInput<typeof updateExamTitle>;
export type UpdateExamTitleOutput = InferToolOutput<typeof updateExamTitle>;

export const upsertMarkStore = tool({
  description: "Updates the mark store for a specific subject and exam type.",
  inputSchema: zodSchema(
    z.object({
      classId: z.number().describe("The unique ID of the class. required"),
      sectionId: z.number().describe("The unique ID of the section. required"),
      studentId: z.number().describe("The unique ID of the student. required"),
      examTypeId: z.number().describe("The unique ID of the exam type. required"),
      subjectId: z.number().describe("The unique ID of the subject. required"),
      subjectCode: z.string().describe("The subject code to be updated. required"),
      newMarks: z.array(z.number()).describe("The new mark to be updated. required"),
      titles: z.array(z.string()).describe("The new title to be updated. required"),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      success: z.boolean().describe("The success status. required"),
      message: z.string().describe("The message to be returned. required"),
      data: z.array(marksInputSchema).optional().describe("The process mark to be updated. optional"),
    })
  ),
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
    console.log("New marks", newMarks);
    console.log("Titles", titles);
    console.log("Exam setup", examSetups);
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

    const processMark = await assessment.doProcessMarks(
      {
        studentId,
        recordId: studentRecord.id,
        classId,
        sectionId,
        schoolId: 1,
        examTypeId,
        studentCategory: CATEGORY[studentRecord.categoryId ?? 0] as Category,
        admissionNo: studentRecord.admissionNo || 0,
        fullName: studentRecord.fullName || "",
        class: "",
        className: "",
        sectionName: "",
        studentCategoryId: studentRecord.categoryId || 0,
        term: "",
        attendance: { daysOpened: 0, daysAbsent: 0, daysPresent: 0 }
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

    return { success: true, message: "Mark store updated successfully", data: processMark.marksInput };
  },
});

export type UpsertMarkStoreInput = InferToolInput<typeof upsertMarkStore>;
export type UpsertMarkStoreOutput = InferToolOutput<typeof upsertMarkStore>;

export const getStudentRegistrationOptions = tool({
  description: [
    "Retrieves all available options for student registration.",
    "ALWAYS call this tool FIRST before collecting student registration information.",
    "Returns lists of classes, sections, student categories, genders, and guardian relations.",
    "Use these options to present choices to the user when registering a new student.",
  ].join("\n"),
  inputSchema: zodSchema(z.object({})),
  outputSchema: zodSchema(
    z.object({
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
    })
  ),
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

export type GetStudentRegistrationOptionsInput = InferToolInput<typeof getStudentRegistrationOptions>;
export type GetStudentRegistrationOptionsOutput = InferToolOutput<typeof getStudentRegistrationOptions>;

export const createStudent = tool({
  description: [
    "Creates a new student record with all required related data (user account, parent/guardian, student record, class enrollment).",
    "IMPORTANT: Before calling this tool, you MUST first call 'getStudentRegistrationOptions' to get available classes, sections, categories, genders, and guardian relations.",
    "If admissionNo is provided and a student with that admission number already exists, returns the existing student.",
  ].join("\n"),
  inputSchema: zodSchema(
    z.object({
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
      email: z.string().optional().describe("Optional Student's email address."),
      mobile: z.string().optional().describe("Optional Student's mobile/phone number."),
      dateOfBirth: z.string().optional().describe("Optional Date of birth in 'YYYY-MM-DD' format."),
      schoolId: z.number().optional().describe("Optional School ID. Defaults to 1."),
      academicId: z.number().optional().describe("Optional Academic year ID. Auto-fetched if not provided."),
      admissionNo: z.number().optional().describe("Optional Admission number. Auto-incremented if not provided."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
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
    })
  ),
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

      return {
        success: true,
        message: `Student "${fullName}" created successfully with ID ${student.id}.`,
        isExisting: false,
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

export type CreateStudentInput = InferToolInput<typeof createStudent>;
export type CreateStudentOutput = InferToolOutput<typeof createStudent>;

export const assignClassSection = tool({
  description: [
    "Assigns a student to a new class and section using their unique IDs.",
    "This tool should be used after confirming the correct class and section IDs, usually via the `searchClassSection` tool.",
    "It performs a direct assignment on the student's records.",
  ].join("\n"),
  inputSchema: zodSchema(
    z.object({
      studentId: z.number().describe("The unique ID of the student."),
      classId: z.number().describe("The unique ID of the destination class."),
      sectionId: z.number().describe("The unique ID of the destination section."),
      className: z.string().optional().describe("The name of the class (for confirmation message)."),
      sectionName: z.string().optional().describe("The name of the section (for confirmation message)."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      success: z.boolean(),
      message: z.string(),
    })
  ),
  execute: async ({ studentId, classId, sectionId, className, sectionName }) => {
    try {
      const result = await studentRepo.assignClassSection({
        studentId,
        classId,
        sectionId,
      });

      if (!result) {
        return {
          success: false,
          message: "Failed to update student records.",
        };
      }

      const location = className && sectionName ? ` to ${className} (${sectionName})` : "";
      return {
        success: true,
        message: `Student successfully moved${location}.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        message: `Error assigning student: ${errorMessage}`,
      };
    }
  },
});

export type AssignClassSectionInput = InferToolInput<typeof assignClassSection>;
export type AssignClassSectionOutput = InferToolOutput<typeof assignClassSection>;

export const searchClassSection = tool({
  description: [
    "Searches for available classes and sections matching a query string.",
    "Use this tool when a user provides a class or section name that might be misspelled, or to find IDs before assignment.",
    "If no query is provided, it returns all active class/section combinations.",
  ].join("\n"),
  inputSchema: zodSchema(
    z.object({
      query: z.string().optional().describe("The name or partial name of the class or section to search for."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      success: z.boolean(),
      results: z.array(
        z.object({
          classId: z.number(),
          className: z.string(),
          sectionId: z.number(),
          sectionName: z.string(),
        })
      ),
      message: z.string(),
    })
  ),
  execute: async ({ query }) => {
    try {
      const results = await studentRepo.searchClassSection(query);
      if (results.length === 0) {
        return {
          success: true,
          results: [],
          message: `No classes or sections found matching "${query}".`,
        };
      }
      return {
        success: true,
        results,
        message: `Found ${results.length} matching class/section combinations.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        results: [],
        message: `Error searching classes: ${errorMessage}`,
      };
    }
  },
});

export type SearchClassSectionInput = InferToolInput<typeof searchClassSection>;
export type SearchClassSectionOutput = InferToolOutput<typeof searchClassSection>;

export const getAssessmentMapping = tool({
  description:
    "Retrieves mapping data for assessments, including exam setups, exam types, student categories, assigned subjects, and class/section assignments for a specific class and section.",
  inputSchema: zodSchema(
    z.object({
      classId: z.number().describe("The unique ID of the class. required"),
      sectionId: z.number().describe("The unique ID of the section. required"),
      staffId: z.number().optional().describe("The unique ID of the staff member (optional)."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      success: z.boolean(),
      data: z.any().optional(),
      message: z.string().optional(),
    })
  ),
  execute: async ({ classId, sectionId, staffId }) => {
    try {
      let finalStaffId = staffId;
      if (!finalStaffId) {
        const staff = await staffRepo.getStaffByClassSection({ classId, sectionId });
        if (!staff || !staff.teacherId) {
          return { success: false, message: "No staff assigned to this class and section." };
        }
        finalStaffId = staff.teacherId;
      }
      const data = await assessment.getMappingData(finalStaffId!, classId, sectionId);
      return { success: true, message: "Mapping data fetched successfully", data };
    } catch (error) {
      return { success: false, message: "Failed to fetch mapping data" };
    }
  },
});

export type GetAssessmentMappingInput = InferToolInput<typeof getAssessmentMapping>;
export type GetAssessmentMappingOutput = InferToolOutput<typeof getAssessmentMapping>;

export const changeParentEmail = tool({
  description: [
    "Changes the email address of a parent/guardian.",
    "Updates both the 'users' and 'sm_parents' tables.",
    "If 'currentEmail' is provided, it attempts to find and update that specific record directly.",
    "If 'currentEmail' is NOT provided, it searches for parents by name.",
    "If multiple parents are found with the same name, it returns a list for the user to select from.",
  ].join("\n"),
  inputSchema: zodSchema(
    z.object({
      newEmail: z.string().email().describe("The new email address to set."),
      currentEmail: z
        .string()
        .email()
        .optional()
        .describe("The current email address of the parent (used for direct selection)."),
      parentName: z.string().optional().describe("The name of the parent/guardian."),
      studentName: z.string().optional().describe("The name of the student."),
      admissionNo: z.number().optional().describe("The student admission number."),
      studentId: z.number().optional().describe("The student unique ID."),
      parentId: z.number().optional().describe("The parent unique ID (from search results)."),
    })
  ),
  outputSchema: zodSchema(
    z.object({
      success: z.boolean(),
      message: z.string(),
      options: z
        .array(
          z.object({
            parentId: z.number(),
            name: z.string(),
            email: z.string(),
            studentName: z.string().optional(),
            admissionNo: z.number().optional(),
          })
        )
        .optional()
        .describe("A list of matching parents if multiple are found."),
    })
  ),
  execute: async ({ parentName, studentName, admissionNo, studentId, newEmail, currentEmail, parentId }) => {
    try {
      // 0. Direct Selection (Parent ID)
      if (parentId) {
        await parentRepo.updateParentEmail(parentId, newEmail);
        return { success: true, message: `Email for parent (ID: ${parentId}) updated successfully.` };
      }

      // 1. Direct Selection (Parent Email)
      if (currentEmail) {
        const parent = await parentRepo.findParentByEmail(currentEmail);
        if (!parent) {
          return {
            success: false,
            message: `No parent found with email "${currentEmail}".`,
          };
        }
        await parentRepo.updateParentEmail(parent.parentId, newEmail);
        return {
          success: true,
          message: `Email for parent "${parent.guardiansName || "N/A"}" updated from "${currentEmail}" to "${newEmail}" successfully.`,
        };
      }

      // 2. Direct Selection (Student ID)
      if (studentId) {
        const result = await parentRepo.findParentByStudentId(studentId);
        if (!result) {
          return {
            success: false,
            message: `No parent found for student ID ${studentId}.`,
          };
        }
        await parentRepo.updateParentEmail(result.parentId, newEmail);
        return {
          success: true,
          message: `Email for parent of "${result.studentName || "Unknown"}" (ID: ${studentId}) updated to "${newEmail}" successfully.`,
        };
      }

      // 3. Direct Selection (Admission No)
      if (admissionNo) {
        const result = await parentRepo.findParentByAdmissionNo(admissionNo);
        if (!result) {
          return {
            success: false,
            message: `No parent found for admission number ${admissionNo}.`,
          };
        }
        await parentRepo.updateParentEmail(result.parentId, newEmail);
        return {
          success: true,
          message: `Email for parent of "${result.studentName || "Unknown"}" (Admin No: ${admissionNo}) updated to "${newEmail}" successfully.`,
        };
      }

      // 4. Fuzzy Search (Student Name)
      if (studentName) {
        const parents = await parentRepo.searchParentsByStudentName(studentName);
        if (parents.length === 0) {
          return {
            success: false,
            message: `No parent found matching student name "${studentName}".`,
          };
        }
        if (parents.length === 1) {
          const parent = parents[0];
          await parentRepo.updateParentEmail(parent.parentId, newEmail);
          return {
            success: true,
            message: `Email for parent of "${parent.studentName || "Unknown"}" updated to "${newEmail}" successfully.`,
          };
        }
        return {
          success: false,
          message: `Multiple students found matching "${studentName}". Please select who the parent is.`,
          options: parents.map((p) => ({
            parentId: p.parentId,
            name: p.guardiansName || "Unknown",
            email: p.guardiansEmail || "N/A",
            studentName: p.studentName ?? undefined,
            admissionNo: p.admissionNo ?? undefined,
          })),
        };
      }

      // 5. Fuzzy Search (Parent Name)
      if (parentName) {
        const parents = await parentRepo.searchParentsByName(parentName);
        if (parents.length === 0) {
          return {
            success: false,
            message: `No parent found matching name "${parentName}".`,
          };
        }
        if (parents.length === 1) {
          const parent = parents[0];
          await parentRepo.updateParentEmail(parent.parentId, newEmail);
          return {
            success: true,
            message: `Email for parent "${parent.guardiansName || "N/A"}" updated to "${newEmail}" successfully.`,
          };
        }
        return {
          success: false,
          message: `Multiple parents found matching "${parentName}". Please select which one to update.`,
          options: parents.map((p) => ({
            parentId: p.parentId,
            name: p.guardiansName || p.fathersName || p.mothersName || "Unknown",
            email: p.guardiansEmail || "N/A",
            studentName: undefined,
            admissionNo: undefined,
          })),
        };
      }

      return {
        success: false,
        message:
          "Please provide a parent name, student name, admission number, or current email to identify the parent.",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        message: `Failed to update parent email: ${errorMessage}`,
      };
    }
  },
});

export type ChangeParentEmailInput = InferToolInput<typeof changeParentEmail>;
export type ChangeParentEmailOutput = InferToolOutput<typeof changeParentEmail>;

