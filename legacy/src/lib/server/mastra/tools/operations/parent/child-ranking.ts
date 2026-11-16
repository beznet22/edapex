import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { examMeritPositions, smStudents } from "$lib/server/db/sms-schema";
import { assertParentOwnsStudent } from "../../internal/parent-permissions";
import { loadStudentClassSection, readParentContext } from "./index";

export const childRankingTool = createTool({
  id: "child-ranking",
  description:
    "Return a child's class position, total mark, and section size for a specific exam type.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    examTypeId: z.number().int().positive().describe("Numeric ID of the exam type"),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    examTypeId: z.number(),
    position: z.number().nullable(),
    totalMark: z.number().nullable(),
    outOf: z.number().nullable(),
    percentile: z.number().nullable(),
    sectionSize: z.number(),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParentOwnsStudent(parent, input.studentId);

    const { classId, sectionId } = await loadStudentClassSection(input.studentId);
    if (classId === null || sectionId === null) {
      return {
        studentId: input.studentId,
        examTypeId: input.examTypeId,
        position: null,
        totalMark: null,
        outOf: null,
        percentile: null,
        sectionSize: 0,
      };
    }

    const db = await getDatabase();
    const [studentEntry] = await db
      .select({
        admissionNo: smStudents.admissionNo,
      })
      .from(smStudents)
      .where(eq(smStudents.id, input.studentId))
      .limit(1);
    const admissionNo = studentEntry?.admissionNo ?? null;

    const sectionRows = await db
      .select({
        position: examMeritPositions.position,
        totalMark: examMeritPositions.totalMark,
        admissionNo: examMeritPositions.admissionNo,
      })
      .from(examMeritPositions)
      .where(
        and(
          eq(examMeritPositions.examTermId, input.examTypeId),
          eq(examMeritPositions.classId, classId),
          eq(examMeritPositions.sectionId, sectionId),
          eq(examMeritPositions.schoolId, parent.schoolId),
        ),
      );

    const sectionSize = sectionRows.length;
    const ownRow =
      admissionNo !== null
        ? sectionRows.find((r) => r.admissionNo === admissionNo) ?? null
        : null;

    let outOf: number | null = null;
    let percentile: number | null = null;
    if (ownRow?.totalMark !== undefined && ownRow?.totalMark !== null) {
      const higher = sectionRows.filter(
        (r) => (r.totalMark ?? 0) > (ownRow.totalMark ?? 0),
      ).length;
      outOf = sectionSize;
      percentile = sectionSize > 0 ? Number(((1 - higher / sectionSize) * 100).toFixed(2)) : null;
    }

    return {
      studentId: input.studentId,
      examTypeId: input.examTypeId,
      position: ownRow?.position ?? null,
      totalMark: ownRow?.totalMark !== undefined && ownRow?.totalMark !== null ? Number(ownRow.totalMark) : null,
      outOf,
      percentile,
      sectionSize,
    };
  },
});