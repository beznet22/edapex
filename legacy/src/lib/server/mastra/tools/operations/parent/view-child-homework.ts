import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smHomeworks, smHomeworkStudents, smSubjects } from "$lib/server/db/sms-schema";
import { assertParentOwnsStudent } from "../../internal/parent-permissions";
import { loadStudentClassSection, readParentContext, todayIso } from "./index";

export const viewChildHomeworkTool = createTool({
  id: "view-child-homework",
  description:
    "Return homework assignments for a child's class, with per-student completion status.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    filter: z
      .enum(["upcoming", "past", "all"])
      .default("upcoming")
      .describe("Date filter: 'upcoming' (due in the future), 'past' (due in the past), or 'all'"),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    homework: z.array(
      z.object({
        homeworkId: z.number(),
        subjectName: z.string().nullable(),
        homeworkDate: z.string().nullable(),
        submissionDate: z.string().nullable(),
        description: z.string().nullable(),
        fileUrl: z.string().nullable(),
        completeStatus: z.string().nullable(),
        teacherComments: z.string().nullable(),
        marks: z.string().nullable(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParentOwnsStudent(parent, input.studentId);

    const { classId, sectionId } = await loadStudentClassSection(input.studentId);
    if (classId === null || sectionId === null) {
      return { studentId: input.studentId, homework: [] };
    }

    const today = todayIso();
    const db = await getDatabase();
    const whereParts = [
      eq(smHomeworks.classId, classId),
      eq(smHomeworks.sectionId, sectionId),
      eq(smHomeworks.schoolId, parent.schoolId),
    ];
    if (input.filter === "upcoming") {
      whereParts.push(gte(smHomeworks.submissionDate, today));
    } else if (input.filter === "past") {
      whereParts.push(lte(smHomeworks.submissionDate, today));
    }
    const rows = await db
      .select({
        homeworkId: smHomeworks.id,
        subjectName: smSubjects.subjectName,
        homeworkDate: smHomeworks.homeworkDate,
        submissionDate: smHomeworks.submissionDate,
        description: smHomeworks.description,
        file: smHomeworks.file,
        completeStatus: smHomeworkStudents.completeStatus,
        teacherComments: smHomeworkStudents.teacherComments,
        marks: smHomeworkStudents.marks,
      })
      .from(smHomeworks)
      .leftJoin(smSubjects, eq(smHomeworks.subjectId, smSubjects.id))
      .leftJoin(
        smHomeworkStudents,
        and(
          eq(smHomeworkStudents.homeworkId, smHomeworks.id),
          eq(smHomeworkStudents.studentId, input.studentId),
        ),
      )
      .where(and(...whereParts))
      .orderBy(asc(smHomeworks.submissionDate));

    return {
      studentId: input.studentId,
      homework: rows.map((r) => ({
        homeworkId: r.homeworkId,
        subjectName: r.subjectName,
        homeworkDate: r.homeworkDate,
        submissionDate: r.submissionDate,
        description: r.description,
        fileUrl: r.file,
        completeStatus: r.completeStatus,
        teacherComments: r.teacherComments,
        marks: r.marks,
      })),
    };
  },
});