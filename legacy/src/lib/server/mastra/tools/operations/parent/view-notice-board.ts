import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smNoticeBoards } from "$lib/server/db/sms-schema";
import { assertParent } from "../../internal/parent-permissions";
import { readParentContext } from "./index";

export const viewNoticeBoardTool = createTool({
  id: "view-notice-board",
  description:
    "Return the most recent published school-wide notices for the parent's school.",
  inputSchema: z.object({
    limit: z.number().int().positive().max(100).default(20).describe("Maximum number of notices to return"),
  }),
  outputSchema: z.object({
    notices: z.array(
      z.object({
        noticeId: z.number(),
        title: z.string().nullable(),
        message: z.string().nullable(),
        noticeDate: z.string().nullable(),
        publishOn: z.string().nullable(),
        informTo: z.string().nullable(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParent(parent);
    const limit = input.limit ?? 20;

    const db = await getDatabase();
    const rows = await db
      .select({
        noticeId: smNoticeBoards.id,
        title: smNoticeBoards.noticeTitle,
        message: smNoticeBoards.noticeMessage,
        noticeDate: smNoticeBoards.noticeDate,
        publishOn: smNoticeBoards.publishOn,
        informTo: smNoticeBoards.informTo,
      })
      .from(smNoticeBoards)
      .where(
        and(
          eq(smNoticeBoards.schoolId, parent.schoolId),
          eq(smNoticeBoards.isPublished, 1),
        ),
      )
      .orderBy(desc(smNoticeBoards.publishOn), desc(smNoticeBoards.id))
      .limit(limit);

    return { notices: rows };
  },
});