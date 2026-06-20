import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smStudents } from "$lib/server/db/sms-schema";
import { createTenantContext, type TenantContext } from "$lib/server/mastra/tenant-context";
import { ForbiddenError, type ParentContext } from "../../internal/parent-permissions";

export type ToolExecuteContext = {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
  };
};

function isParentContext(value: unknown): value is ParentContext {
  if (value === null || typeof value !== "object") return false;
  if (!("parentId" in value)) return false;
  if (!("schoolId" in value)) return false;
  if (typeof value.parentId !== "number") return false;
  if (typeof value.schoolId !== "number") return false;
  return true;
}

export function readParentContext(ctx: ToolExecuteContext): ParentContext {
  const raw = ctx.requestContext?.get("tenantContext");
  if (!isParentContext(raw)) {
    throw new ForbiddenError("PARENT_CONTEXT_REQUIRED: no authenticated parent on this request");
  }
  return raw;
}

export function toTenantContext(parent: ParentContext): TenantContext {
  return createTenantContext({
    schoolId: parent.schoolId,
    userId: parent.userId,
  });
}

export function base64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function loadStudentSchoolId(studentId: number): Promise<number> {
  const db = await getDatabase();
  const [row] = await db
    .select({ schoolId: smStudents.schoolId })
    .from(smStudents)
    .where(and(eq(smStudents.id, studentId), eq(smStudents.activeStatus, 1)))
    .limit(1);
  return row?.schoolId ?? 1;
}

export async function loadStudentClassSection(
  studentId: number,
): Promise<{ classId: number | null; sectionId: number | null; schoolId: number }> {
  const db = await getDatabase();
  const [row] = await db
    .select({
      classId: smStudents.classId,
      sectionId: smStudents.sectionId,
      schoolId: smStudents.schoolId,
    })
    .from(smStudents)
    .where(and(eq(smStudents.id, studentId), eq(smStudents.activeStatus, 1)))
    .limit(1);
  return {
    classId: row?.classId ?? null,
    sectionId: row?.sectionId ?? null,
    schoolId: row?.schoolId ?? 1,
  };
}

export async function listChildIds(parentId: number): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db
    .select({ id: smStudents.id })
    .from(smStudents)
    .where(and(eq(smStudents.parentId, parentId), eq(smStudents.activeStatus, 1)));
  return rows.map((r) => r.id);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export { listMyChildrenTool } from "./list-my-children";
export { viewChildResultTool } from "./view-child-result";
export { downloadChildPdfTool } from "./download-child-pdf";
export { childAttendanceTool } from "./child-attendance";
export { childRankingTool } from "./child-ranking";
export { childPerformanceTrendTool } from "./child-performance-trend";
export { viewChildTimetableTool } from "./view-child-timetable";
export { viewChildHomeworkTool } from "./view-child-homework";
export { viewChildExamScheduleTool } from "./view-child-exam-schedule";
export { viewChildFeesTool } from "./view-child-fees";
export { viewNoticeBoardTool } from "./view-notice-board";
export { viewSchoolEventsTool } from "./view-school-events";
export { viewHolidaysTool } from "./view-holidays";

import { listMyChildrenTool } from "./list-my-children";
import { viewChildResultTool } from "./view-child-result";
import { downloadChildPdfTool } from "./download-child-pdf";
import { childAttendanceTool } from "./child-attendance";
import { childRankingTool } from "./child-ranking";
import { childPerformanceTrendTool } from "./child-performance-trend";
import { viewChildTimetableTool } from "./view-child-timetable";
import { viewChildHomeworkTool } from "./view-child-homework";
import { viewChildExamScheduleTool } from "./view-child-exam-schedule";
import { viewChildFeesTool } from "./view-child-fees";
import { viewNoticeBoardTool } from "./view-notice-board";
import { viewSchoolEventsTool } from "./view-school-events";
import { viewHolidaysTool } from "./view-holidays";

export const parentTools = {
  listMyChildrenTool,
  viewChildResultTool,
  downloadChildPdfTool,
  childAttendanceTool,
  childRankingTool,
  childPerformanceTrendTool,
  viewChildTimetableTool,
  viewChildHomeworkTool,
  viewChildExamScheduleTool,
  viewChildFeesTool,
  viewNoticeBoardTool,
  viewSchoolEventsTool,
  viewHolidaysTool
};