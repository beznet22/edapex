import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smHolidays } from "$lib/server/db/sms-schema";
import { assertParent } from "../../internal/parent-permissions";
import { readParentContext } from "./index";

export const viewHolidaysTool = createTool({
  id: "view-holidays",
  description:
    "Return school holidays for the parent's school. By default returns the next 50; " +
    "narrow by year (e.g. 2026) for an annual view.",
  inputSchema: z.object({
    limit: z.number().int().positive().max(200).default(50).describe("Maximum number of holidays to return"),
    year: z.number().int().min(1970).max(2999).optional().describe("Optional 4-digit year filter (e.g. 2026)"),
  }),
  outputSchema: z.object({
    holidays: z.array(
      z.object({
        holidayId: z.number(),
        name: z.string().nullable(),
        fromDate: z.string().nullable(),
        toDate: z.string().nullable(),
        description: z.string().nullable(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParent(parent);
    const limit = input.limit ?? 50;

    const db = await getDatabase();
    const startBound = input.year !== undefined ? `${input.year}-01-01` : null;
    const endBound = input.year !== undefined ? `${input.year}-12-31` : null;

    const rows = await db
      .select({
        holidayId: smHolidays.id,
        name: smHolidays.holidayTitle,
        fromDate: smHolidays.fromDate,
        toDate: smHolidays.toDate,
        description: smHolidays.details,
      })
      .from(smHolidays)
      .where(
        and(
          eq(smHolidays.schoolId, parent.schoolId),
          eq(smHolidays.activeStatus, 1),
          startBound ? gte(smHolidays.fromDate, startBound) : undefined,
          endBound ? lte(smHolidays.fromDate, endBound) : undefined,
        ),
      )
      .orderBy(asc(smHolidays.fromDate), asc(smHolidays.id))
      .limit(limit);

    return { holidays: rows };
  },
});