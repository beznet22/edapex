import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, asc, eq, gte } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smEvents } from "$lib/server/db/sms-schema";
import { assertParent } from "../../internal/parent-permissions";
import { readParentContext, todayIso } from "./index";

export const viewSchoolEventsTool = createTool({
  id: "view-school-events",
  description:
    "Return upcoming school events for the parent's school, ordered by start date.",
  inputSchema: z.object({
    limit: z.number().int().positive().max(100).default(20).describe("Maximum number of events to return"),
    fromDate: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) lower bound (defaults to today)"),
  }),
  outputSchema: z.object({
    events: z.array(
      z.object({
        eventId: z.number(),
        title: z.string().nullable(),
        fromDate: z.string().nullable(),
        toDate: z.string().nullable(),
        location: z.string().nullable(),
        description: z.string().nullable(),
        url: z.string().nullable(),
        imageUrl: z.string().nullable(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParent(parent);
    const limit = input.limit ?? 20;

    const lower = input.fromDate ?? todayIso();
    const db = await getDatabase();
    const rows = await db
      .select({
        eventId: smEvents.id,
        title: smEvents.eventTitle,
        fromDate: smEvents.fromDate,
        toDate: smEvents.toDate,
        location: smEvents.eventLocation,
        description: smEvents.eventDes,
        url: smEvents.url,
        imageUrl: smEvents.upladImageFile,
      })
      .from(smEvents)
      .where(
        and(
          eq(smEvents.schoolId, parent.schoolId),
          eq(smEvents.activeStatus, 1),
          gte(smEvents.toDate, lower),
        ),
      )
      .orderBy(asc(smEvents.fromDate), asc(smEvents.id))
      .limit(limit);

    return { events: rows };
  },
});