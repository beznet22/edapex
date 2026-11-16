import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smClasses, smSections, smStudents } from "$lib/server/db/sms-schema";
import { assertParent } from "../../internal/parent-permissions";
import { listChildIds, readParentContext } from "./index";

export const listMyChildrenTool = createTool({
  id: "list-my-children",
  description:
    "List all children (students) registered under the authenticated parent. " +
    "Call this when the parent's intent is ambiguous about which child to address.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    children: z.array(
      z.object({
        studentId: z.number(),
        fullName: z.string().nullable(),
        admissionNo: z.number().nullable(),
        classId: z.number().nullable(),
        className: z.string().nullable(),
        sectionId: z.number().nullable(),
        sectionName: z.string().nullable(),
        rollNo: z.number().nullable(),
        studentPhoto: z.string().nullable(),
      }),
    ),
  }),
  execute: async (_input, ctx) => {
    const parent = readParentContext(ctx);
    assertParent(parent);
    const childIds = parent.childIds.length > 0 ? parent.childIds : await listChildIds(parent.parentId);
    if (childIds.length === 0) {
      return { children: [] };
    }
    const db = await getDatabase();
    const rows = await db
      .select({
        studentId: smStudents.id,
        fullName: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
        classId: smStudents.classId,
        className: smClasses.className,
        sectionId: smStudents.sectionId,
        sectionName: smSections.sectionName,
        rollNo: smStudents.rollNo,
        studentPhoto: smStudents.studentPhoto,
      })
      .from(smStudents)
      .leftJoin(smClasses, eq(smStudents.classId, smClasses.id))
      .leftJoin(smSections, eq(smStudents.sectionId, smSections.id))
      .where(
        and(
          inArray(smStudents.id, childIds),
          eq(smStudents.activeStatus, 1),
          eq(smStudents.parentId, parent.parentId),
        ),
      )
      .orderBy(asc(smStudents.id));
    return { children: rows };
  },
});