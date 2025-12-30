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
        "Use this before sending results."
    ].join("\n"),
    inputSchema: z.object({
        classId: z.number().describe("The Class ID to validate results for."),
        examTypeId: z.number().describe("The Exam Type ID to validate results for."),
        sectionId: z.number().optional().describe("Optional Section ID to filter students."),
    }),
    outputSchema: z.object({
        totalStudents: z.number(),
        validCount: z.number(),
        invalidCount: z.number(),
        resultStatus: z.array(z.object({
            studentId: z.number(),
            name: z.string(),
            admissionNo: z.number(),
            issues: z.array(z.string()),
            valid: z.boolean(),
            token: z.string().optional(),
        })).describe("List of students with invalid or missing results."),
        message: z.string(),
    }),
    execute: async ({ classId, examTypeId, sectionId }) => {
        const students = await studentRepo.getStudentsByClassId(classId, sectionId);

        if (!students || students.length === 0) {
            return {
                totalStudents: 0,
                validCount: 0,
                invalidCount: 0,
                resultStatus: [],
                message: "No students found in this class.",
            };
        }

        let validCount = 0;
        let invalidCount = 0;
        const resultStatus: { studentId: number; name: string; admissionNo: number; issues: string[]; valid: boolean; token?: string }[] = [];

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
                    issues.push(...parsed.error.issues.map((e: z.core.$ZodIssue) => `${e.path.join('.')}: ${e.message}`));
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


export const sendClassResults = tool({
    description: [
        "Sends/Publishes results for a class.",
        "Marks the result as published in the student timeline.",
        "Should be called only after validation is successful or deemed acceptable."
    ].join("\n"),
    inputSchema: z.object({
        classId: z.number().describe("The Class ID."),
        sectionId: z.number().optional().describe("Optional Section ID."),
        examTypeId: z.number().describe("The Exam Type ID."),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
    }),
    execute: async ({ classId, examTypeId, sectionId }) => {
        const students = await studentRepo.getStudentsByClassId(classId, sectionId);
        if (!students || students.length === 0) {
            return { success: false, message: "No students found." };
        }

        await result.publishResult({ studentIds: students.map((s) => s.id), examId: examTypeId })
            .catch(e => console.error("Background Result Publication Failed:", e));

        return {
            success: true,
            message: `Results queued for publication.`
        };
    }
});


export const getStudentList = tool({
    description: "Retrieves a list of all students assigned to a specific staff member. Returns student IDs, names, and admission numbers. Essential when 'studentId' or 'admissionNo' is unknown.",
    inputSchema: z.object({
        classId: z.number().describe("The unique ID of the class."),
        sectionId: z.number().optional().describe("Optional Section ID."),
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
        const students = await studentRepo.getStudentsByClassId(input.classId, input.sectionId);
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
    execute: async (input) => {
        const student = await studentRepo.getStudentById(input.studentId);
        if (!student) {
            return { success: false, message: "Student not found." };
        }
        student.fullName = input.name;
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
    execute: async (input) => {
        const affectedRows = await resultRepo.updateExamSetup({
            examTitles: input.newExamTitles,
            classId: input.classId,
            sectionId: input.sectionId,
            examTermId: input.examTypeId,
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
    execute: async (input) => {
        const examSetups = await resultRepo.getExamSetup({
            classId: input.classId,
            sectionId: input.sectionId,
            examTypeId: input.examTypeId,
            subjectId: input.subjectId,
            schoolId: 1,
        });

        if (!examSetups || examSetups.length === 0) {
            return { success: false, message: "Exam setup not found." };
        }

        const studentRecord = await studentRepo.getStudentRecord({
            classId: input.classId,
            sectionId: input.sectionId,
            studentId: input.studentId,
        });
        if (!studentRecord) {
            return { success: false, message: "Student not found." };
        }

        const processMark = await result.doProcessMarks({
            category: CATEGORY[studentRecord.categoryId ?? 0] as Category,
            studentId: input.studentId,
            recordId: studentRecord.id,
            classId: input.classId,
            sectionId: input.sectionId,
            schoolId: 1,
            examTypeId: input.examTypeId,
        }, [{
            subjectId: input.subjectId,
            subjectCode: input.subjectCode,
            marks: input.newMarks,
            examTitles: input.titles
        }],
            examSetups
        )
        if (!processMark) {
            return { success: false, message: "Mark store update failed." };
        }

        return { success: true, message: `Mark store updated successfully`, data: processMark };
    },
}); 
