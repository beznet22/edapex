import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { examMeritPositions, smExamTypes, smResultStores, smStudents } from "$lib/server/db/sms-schema";
import { assertParentOwnsStudent } from "../../internal/parent-permissions";
import { loadStudentClassSection, readParentContext } from "./index";

export const childPerformanceTrendTool = createTool({
  id: "child-performance-trend",
  description:
    "Return a child's last N exam results (default 5) ordered by exam date, with per-exam total and grade.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    limit: z.number().int().positive().max(20).default(5).describe("Maximum number of exams to return"),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    trend: z.array(
      z.object({
        examTypeId: z.number().nullable(),
        examTypeTitle: z.string().nullable(),
        examDate: z.string().nullable(),
        totalMarks: z.number().nullable(),
        totalGpaGrade: z.string().nullable(),
        position: z.number().nullable(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParentOwnsStudent(parent, input.studentId);
    const limit = input.limit ?? 5;

    const db = await getDatabase();
    const rows = await db
      .select({
        examTypeId: smResultStores.examTypeId,
        examTypeTitle: smExamTypes.title,
        totalMarks: smResultStores.totalMarks,
        totalGpaGrade: smResultStores.totalGpaGrade,
      })
      .from(smResultStores)
      .leftJoin(smExamTypes, eq(smResultStores.examTypeId, smExamTypes.id))
      .where(
        and(
          eq(smResultStores.studentId, input.studentId),
          eq(smResultStores.activeStatus, 1),
          eq(smResultStores.schoolId, parent.schoolId),
        ),
      )
      .orderBy(desc(smResultStores.examTypeId));

    const seenExamTypeIds = new Set<number>();
    const deduped: Array<{
      examTypeId: number | null;
      examTypeTitle: string | null;
      totalMarks: number | null;
      totalGpaGrade: string | null;
    }> = [];
    for (const row of rows) {
      const key = row.examTypeId ?? -1;
      if (seenExamTypeIds.has(key)) continue;
      seenExamTypeIds.add(key);
      deduped.push({
        examTypeId: row.examTypeId,
        examTypeTitle: row.examTypeTitle,
        totalMarks: row.totalMarks !== null ? Number(row.totalMarks) : null,
        totalGpaGrade: row.totalGpaGrade,
      });
      if (deduped.length >= limit) break;
    }

    const { classId, sectionId } = await loadStudentClassSection(input.studentId);

    const positions: Array<{ examTypeId: number; position: number | null }> = [];
    if (classId !== null && sectionId !== null) {
      const examTypeIds = deduped
        .map((d) => d.examTypeId)
        .filter((id): id is number => id !== null);
      if (examTypeIds.length > 0) {
        const meritRows = await db
          .select({
            examTermId: examMeritPositions.examTermId,
            position: examMeritPositions.position,
            admissionNo: examMeritPositions.admissionNo,
          })
          .from(examMeritPositions)
          .where(
            and(
              inArray(examMeritPositions.examTermId, examTypeIds),
              eq(examMeritPositions.classId, classId),
              eq(examMeritPositions.sectionId, sectionId),
              eq(examMeritPositions.schoolId, parent.schoolId),
            ),
          );
        const [studentRow] = await db
          .select({ admissionNo: smStudents.admissionNo })
          .from(smStudents)
          .where(eq(smStudents.id, input.studentId))
          .limit(1);
        const admissionNo = studentRow?.admissionNo ?? null;
        for (const examTypeId of examTypeIds) {
          const own = meritRows.find(
            (m) => m.examTermId === examTypeId && m.admissionNo === admissionNo,
          );
          positions.push({ examTypeId, position: own?.position ?? null });
        }
      }
    }

    return {
      studentId: input.studentId,
      trend: deduped.map((d) => {
        const pos = d.examTypeId !== null ? positions.find((p) => p.examTypeId === d.examTypeId) : undefined;
        return {
          examTypeId: d.examTypeId,
          examTypeTitle: d.examTypeTitle,
          examDate: null,
          totalMarks: d.totalMarks,
          totalGpaGrade: d.totalGpaGrade,
          position: pos?.position ?? null,
        };
      }),
    };
  },
});