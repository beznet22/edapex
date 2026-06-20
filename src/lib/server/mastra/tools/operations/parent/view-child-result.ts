import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, asc, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smExamTypes, smResultStores, smSubjects } from "$lib/server/db/sms-schema";
import { assertParentOwnsStudent } from "../../internal/parent-permissions";
import { readParentContext } from "./index";

export const viewChildResultTool = createTool({
  id: "view-child-result",
  description:
    "View a child's exam results (per subject totals + per-exam summary) for one exam type. " +
    "If examTypeId is omitted, returns results for all exam types the child has rows for.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    examTypeId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional exam type ID to filter by. If omitted, all exam types are returned."),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    results: z.array(
      z.object({
        examTypeId: z.number().nullable(),
        examTypeTitle: z.string().nullable(),
        totalMarks: z.number().nullable(),
        totalGpaPoint: z.number().nullable(),
        totalGpaGrade: z.string().nullable(),
        teacherRemarks: z.string().nullable(),
        subjects: z.array(
          z.object({
            subjectId: z.number().nullable(),
            subjectName: z.string().nullable(),
            marks: z.number().nullable(),
            grade: z.string().nullable(),
          }),
        ),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParentOwnsStudent(parent, input.studentId);

    const db = await getDatabase();
    const rows = await db
      .select({
        resultId: smResultStores.id,
        examTypeId: smResultStores.examTypeId,
        examTypeTitle: smExamTypes.title,
        subjectId: smResultStores.subjectId,
        subjectName: smSubjects.subjectName,
        totalMarks: smResultStores.totalMarks,
        totalGpaPoint: smResultStores.totalGpaPoint,
        totalGpaGrade: smResultStores.totalGpaGrade,
        teacherRemarks: smResultStores.teacherRemarks,
      })
      .from(smResultStores)
      .leftJoin(smSubjects, eq(smResultStores.subjectId, smSubjects.id))
      .leftJoin(smExamTypes, eq(smResultStores.examTypeId, smExamTypes.id))
      .where(
        and(
          eq(smResultStores.studentId, input.studentId),
          eq(smResultStores.activeStatus, 1),
          input.examTypeId !== undefined ? eq(smResultStores.examTypeId, input.examTypeId) : undefined,
        ),
      )
      .orderBy(asc(smResultStores.examTypeId), asc(smResultStores.subjectId));

    const grouped = new Map<
      number,
      {
        examTypeId: number | null;
        examTypeTitle: string | null;
        totalMarks: number | null;
        totalGpaPoint: number | null;
        totalGpaGrade: string | null;
        teacherRemarks: string | null;
        subjects: Array<{ subjectId: number | null; subjectName: string | null; marks: number | null; grade: string | null }>;
      }
    >();

    for (const row of rows) {
      const key = row.examTypeId ?? -1;
      let entry = grouped.get(key);
      if (!entry) {
        entry = {
          examTypeId: row.examTypeId,
          examTypeTitle: row.examTypeTitle,
          totalMarks: row.totalMarks !== null ? Number(row.totalMarks) : null,
          totalGpaPoint: row.totalGpaPoint !== null ? Number(row.totalGpaPoint) : null,
          totalGpaGrade: row.totalGpaGrade,
          teacherRemarks: row.teacherRemarks,
          subjects: [],
        };
        grouped.set(key, entry);
      }
      entry.subjects.push({
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        marks: row.totalMarks !== null ? Number(row.totalMarks) : null,
        grade: row.totalGpaGrade,
      });
    }

    return {
      studentId: input.studentId,
      results: Array.from(grouped.values()),
    };
  },
});