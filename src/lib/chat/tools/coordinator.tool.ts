import z from "zod";
import { tool } from "ai";
import { studentRepo } from "$lib/server/repository/student.repo";
import { result } from "$lib/server/service/result.service";
import { smStudentTimelines } from "$lib/server/db/sms-schema";
import { repo } from "$lib/server/repository";
import { resultOutputSchema } from "$lib/schema/result-output";

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
        const resultStatus: { studentId: number; name: string; admissionNo: number; issues: string[]; valid: boolean }[] = [];

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
