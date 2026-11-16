import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smExamSchedules, smExamTypes, smExams, smStaffs, smSubjects } from "$lib/server/db/sms-schema";
import { assertParentOwnsStudent } from "../../internal/parent-permissions";
import { loadStudentClassSection, readParentContext, todayIso } from "./index";

export const viewChildExamScheduleTool = createTool({
  id: "view-child-exam-schedule",
  description:
    "Return upcoming (or date-range filtered) exam entries for a child's class section, " +
    "including subject, time, room, and invigilating teacher.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    fromDate: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) lower bound (defaults to today)"),
    toDate: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) upper bound"),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    exams: z.array(
      z.object({
        examId: z.number().nullable(),
        examTypeTitle: z.string().nullable(),
        subjectName: z.string().nullable(),
        date: z.string().nullable(),
        startTime: z.string().nullable(),
        endTime: z.string().nullable(),
        roomId: z.number().nullable(),
        teacherName: z.string().nullable(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParentOwnsStudent(parent, input.studentId);

    const { classId, sectionId } = await loadStudentClassSection(input.studentId);
    if (classId === null || sectionId === null) {
      return { studentId: input.studentId, exams: [] };
    }
    const lower = input.fromDate ?? todayIso();
    const db = await getDatabase();
    const rows = await db
      .select({
        examId: smExamSchedules.examId,
        examTypeTitle: smExamTypes.title,
        subjectName: smSubjects.subjectName,
        date: smExamSchedules.date,
        startTime: smExamSchedules.startTime,
        endTime: smExamSchedules.endTime,
        roomId: smExamSchedules.roomId,
        teacherName: smStaffs.fullName,
        examMark: smExams.examMark,
      })
      .from(smExamSchedules)
      .leftJoin(smExams, eq(smExamSchedules.examId, smExams.id))
      .leftJoin(smExamTypes, eq(smExamSchedules.examTermId, smExamTypes.id))
      .leftJoin(smSubjects, eq(smExamSchedules.subjectId, smSubjects.id))
      .leftJoin(smStaffs, eq(smExamSchedules.teacherId, smStaffs.id))
      .where(
        and(
          eq(smExamSchedules.classId, classId),
          eq(smExamSchedules.sectionId, sectionId),
          eq(smExamSchedules.schoolId, parent.schoolId),
          gte(smExamSchedules.date, lower),
          input.toDate ? lte(smExamSchedules.date, input.toDate) : undefined,
        ),
      )
      .orderBy(asc(smExamSchedules.date), asc(smExamSchedules.startTime));

    return {
      studentId: input.studentId,
      exams: rows.map((r) => ({
        examId: r.examId,
        examTypeTitle: r.examTypeTitle,
        subjectName: r.subjectName,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        roomId: r.roomId,
        teacherName: r.teacherName,
      })),
    };
  },
});