import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smStudentAttendances } from "$lib/server/db/sms-schema";
import { assertParentOwnsStudent } from "../../internal/parent-permissions";
import { readParentContext } from "./index";

export const childAttendanceTool = createTool({
  id: "child-attendance",
  description:
    "Return attendance totals and recent daily records for a child. " +
    "Optional date range filters narrow the recent-records list to a window.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    fromDate: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) lower bound"),
    toDate: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) upper bound"),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    totalPresent: z.number(),
    totalAbsent: z.number(),
    daysOpened: z.number(),
    recentRecords: z.array(
      z.object({
        attendanceDate: z.string().nullable(),
        attendanceType: z.string().nullable(),
        notes: z.string().nullable(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParentOwnsStudent(parent, input.studentId);

    const db = await getDatabase();
    const rows = await db
      .select({
        attendanceDate: smStudentAttendances.attendanceDate,
        attendanceType: smStudentAttendances.attendanceType,
        notes: smStudentAttendances.notes,
      })
      .from(smStudentAttendances)
      .where(
        and(
          eq(smStudentAttendances.studentId, input.studentId),
          eq(smStudentAttendances.schoolId, parent.schoolId),
          input.fromDate ? gte(smStudentAttendances.attendanceDate, input.fromDate) : undefined,
          input.toDate ? lte(smStudentAttendances.attendanceDate, input.toDate) : undefined,
        ),
      )
      .orderBy(desc(smStudentAttendances.attendanceDate));

    let totalPresent = 0;
    let totalAbsent = 0;
    for (const row of rows) {
      const type = (row.attendanceType ?? "").toUpperCase();
      if (type === "P" || type === "PRESENT") {
        totalPresent += 1;
      } else if (type === "A" || type === "ABSENT") {
        totalAbsent += 1;
      }
    }

    return {
      studentId: input.studentId,
      totalPresent,
      totalAbsent,
      daysOpened: rows.length,
      recentRecords: rows.slice(0, 30).map((r) => ({
        attendanceDate: r.attendanceDate,
        attendanceType: r.attendanceType,
        notes: r.notes,
      })),
    };
  },
});