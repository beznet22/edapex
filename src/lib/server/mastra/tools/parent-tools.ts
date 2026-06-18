import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import {
  examMeritPositions,
  smClasses,
  smClassRoutineUpdates,
  smClassRoutines,
  smExams,
  smExamSchedules,
  smExamTypes,
  smEvents,
  smFeesAssigns,
  smFeesGroups,
  smFeesMasters,
  smFeesPayments,
  smFeesTypes,
  smHolidays,
  smHomeworkStudents,
  smHomeworks,
  smNoticeBoards,
  smResultStores,
  smSections,
  smStaffs,
  smStudentAttendances,
  smStudents,
  smSubjects,
} from "$lib/server/db/sms-schema";
import {
  createTenantContext,
  type TenantContext,
} from "$lib/server/mastra/tenant-context";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import {
  assertParent,
  assertParentOwnsStudent,
  ForbiddenError,
  type ParentContext,
} from "./parent-permissions";

type ToolExecuteContext = {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
  };
};

function readParentContext(ctx: ToolExecuteContext): ParentContext {
  const raw = ctx.requestContext?.get("tenantContext") as ParentContext | undefined;
  if (!raw) {
    throw new ForbiddenError("PARENT_CONTEXT_REQUIRED: no authenticated parent on this request");
  }
  return raw;
}

function toTenantContext(parent: ParentContext): TenantContext {
  return createTenantContext({
    schoolId: parent.schoolId,
    userId: parent.userId,
  });
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function loadStudentSchoolId(studentId: number): Promise<number> {
  const db = await getDatabase();
  const [row] = await db
    .select({ schoolId: smStudents.schoolId })
    .from(smStudents)
    .where(and(eq(smStudents.id, studentId), eq(smStudents.activeStatus, 1)))
    .limit(1);
  return row?.schoolId ?? 1;
}

async function loadStudentClassSection(
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

async function listChildIds(parentId: number): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db
    .select({ id: smStudents.id })
    .from(smStudents)
    .where(and(eq(smStudents.parentId, parentId), eq(smStudents.activeStatus, 1)));
  return rows.map((r) => r.id);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── 1. list-my-children ─────────────────────────────────────────────────────

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
    const parent = readParentContext(ctx as ToolExecuteContext);
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

// ─── 2. view-child-result ────────────────────────────────────────────────────

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
    const parent = readParentContext(ctx as ToolExecuteContext);
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

// ─── 3. download-child-pdf ───────────────────────────────────────────────────

export const downloadChildPdfTool = createTool({
  id: "download-child-pdf",
  description:
    "Return a public URL pointing to the rendered report-card PDF for a given " +
    "child and exam type. Verifies the file exists in the tenant workspace " +
    "before returning a tokenized URL.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    examTypeId: z.number().int().positive().describe("Numeric ID of the exam type"),
  }),
  outputSchema: z.object({
    url: z.string(),
    storagePath: z.string(),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx as ToolExecuteContext);
    assertParentOwnsStudent(parent, input.studentId);

    const tenant = toTenantContext(parent);
    const storagePath = `exams/examType-${input.examTypeId}/pdfs/${input.studentId}.pdf`;

    const requestContext = buildWorkspaceRequestContext(
      createTenantContext({
        ...tenant,
        examTypeId: input.examTypeId,
      }),
    );
    const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
    if (!fs) {
      throw new Error("WORKSPACE_UNAVAILABLE: tenant workspace filesystem is not configured");
    }
    const exists = await fs.exists(storagePath);
    if (!exists) {
      throw new Error(
        `PDF_NOT_READY: no rendered report card at ${storagePath} for studentId=${input.studentId}`,
      );
    }

    const token = base64url(JSON.stringify({ studentId: input.studentId, examTypeId: input.examTypeId }));
    return {
      url: `/api/results/${token}`,
      storagePath,
    };
  },
});

// ─── 4. child-attendance ─────────────────────────────────────────────────────

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
    const parent = readParentContext(ctx as ToolExecuteContext);
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

// ─── 5. child-ranking ───────────────────────────────────────────────────────

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
    const parent = readParentContext(ctx as ToolExecuteContext);
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

// ─── 6. child-performance-trend ─────────────────────────────────────────────

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
    const parent = readParentContext(ctx as ToolExecuteContext);
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

// ─── 7. view-child-timetable ─────────────────────────────────────────────────

type RoutineDayEntry = {
  startTime: string | null;
  endTime: string | null;
  subject: string | null;
  teacherName: string | null;
  roomId: number | null;
};

type WeekSchedule = {
  monday: RoutineDayEntry[];
  tuesday: RoutineDayEntry[];
  wednesday: RoutineDayEntry[];
  thursday: RoutineDayEntry[];
  friday: RoutineDayEntry[];
  saturday: RoutineDayEntry[];
  sunday: RoutineDayEntry[];
};

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY_NUMBERS: Record<keyof WeekSchedule, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function emptyWeek(): WeekSchedule {
  return { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
}

export const viewChildTimetableTool = createTool({
  id: "view-child-timetable",
  description:
    "Return a child's class timetable grouped by weekday. Reads the modern " +
    "smClassRoutineUpdates table when present, otherwise falls back to the " +
    "legacy smClassRoutines flat layout.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    weekStartDate: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) marking the week's start"),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    className: z.string().nullable(),
    sectionName: z.string().nullable(),
    weekSchedule: z.object({
      monday: z.array(z.object({ startTime: z.string().nullable(), endTime: z.string().nullable(), subject: z.string().nullable(), teacherName: z.string().nullable(), roomId: z.number().nullable() })),
      tuesday: z.array(z.object({ startTime: z.string().nullable(), endTime: z.string().nullable(), subject: z.string().nullable(), teacherName: z.string().nullable(), roomId: z.number().nullable() })),
      wednesday: z.array(z.object({ startTime: z.string().nullable(), endTime: z.string().nullable(), subject: z.string().nullable(), teacherName: z.string().nullable(), roomId: z.number().nullable() })),
      thursday: z.array(z.object({ startTime: z.string().nullable(), endTime: z.string().nullable(), subject: z.string().nullable(), teacherName: z.string().nullable(), roomId: z.number().nullable() })),
      friday: z.array(z.object({ startTime: z.string().nullable(), endTime: z.string().nullable(), subject: z.string().nullable(), teacherName: z.string().nullable(), roomId: z.number().nullable() })),
      saturday: z.array(z.object({ startTime: z.string().nullable(), endTime: z.string().nullable(), subject: z.string().nullable(), teacherName: z.string().nullable(), roomId: z.number().nullable() })),
      sunday: z.array(z.object({ startTime: z.string().nullable(), endTime: z.string().nullable(), subject: z.string().nullable(), teacherName: z.string().nullable(), roomId: z.number().nullable() })),
    }),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx as ToolExecuteContext);
    assertParentOwnsStudent(parent, input.studentId);

    const { classId, sectionId } = await loadStudentClassSection(input.studentId);
    if (classId === null || sectionId === null) {
      return {
        studentId: input.studentId,
        className: null,
        sectionName: null,
        weekSchedule: emptyWeek(),
      };
    }

    const db = await getDatabase();
    const [classRow] = await db
      .select({ name: smClasses.className })
      .from(smClasses)
      .where(eq(smClasses.id, classId))
      .limit(1);
    const [sectionRow] = await db
      .select({ name: smSections.sectionName })
      .from(smSections)
      .where(eq(smSections.id, sectionId))
      .limit(1);

    const modern = await db
      .select({
        day: smClassRoutineUpdates.day,
        startTime: smClassRoutineUpdates.startTime,
        endTime: smClassRoutineUpdates.endTime,
        roomId: smClassRoutineUpdates.roomId,
        teacherId: smClassRoutineUpdates.teacherId,
        subjectName: smSubjects.subjectName,
        teacherName: smStaffs.fullName,
      })
      .from(smClassRoutineUpdates)
      .leftJoin(smSubjects, eq(smClassRoutineUpdates.subjectId, smSubjects.id))
      .leftJoin(smStaffs, eq(smClassRoutineUpdates.teacherId, smStaffs.id))
      .where(
        and(
          eq(smClassRoutineUpdates.classId, classId),
          eq(smClassRoutineUpdates.sectionId, sectionId),
          eq(smClassRoutineUpdates.schoolId, parent.schoolId),
          eq(smClassRoutineUpdates.activeStatus, 1),
        ),
      )
      .orderBy(asc(smClassRoutineUpdates.startTime));

    const week = emptyWeek();
    if (modern.length > 0) {
      for (const row of modern) {
        const dayNumber = row.day ?? -1;
        const dayKey = (DAY_KEYS.find((d) => DAY_NUMBERS[d] === dayNumber) ?? "monday") as keyof WeekSchedule;
        week[dayKey].push({
          startTime: row.startTime,
          endTime: row.endTime,
          subject: row.subjectName,
          teacherName: row.teacherName,
          roomId: row.roomId,
        });
      }
    } else {
      const [legacy] = await db
        .select({
          mondaySubject: smClassRoutines.monday,
          mondayStart: smClassRoutines.mondayStartFrom,
          mondayEnd: smClassRoutines.mondayEndTo,
          mondayRoom: smClassRoutines.mondayRoomId,
          tuesdaySubject: smClassRoutines.tuesday,
          tuesdayStart: smClassRoutines.tuesdayStartFrom,
          tuesdayEnd: smClassRoutines.tuesdayEndTo,
          tuesdayRoom: smClassRoutines.tuesdayRoomId,
          wednesdaySubject: smClassRoutines.wednesday,
          wednesdayStart: smClassRoutines.wednesdayStartFrom,
          wednesdayEnd: smClassRoutines.wednesdayEndTo,
          wednesdayRoom: smClassRoutines.wednesdayRoomId,
          thursdaySubject: smClassRoutines.thursday,
          thursdayStart: smClassRoutines.thursdayStartFrom,
          thursdayEnd: smClassRoutines.thursdayEndTo,
          thursdayRoom: smClassRoutines.thursdayRoomId,
          fridaySubject: smClassRoutines.friday,
          fridayStart: smClassRoutines.fridayStartFrom,
          fridayEnd: smClassRoutines.fridayEndTo,
          fridayRoom: smClassRoutines.fridayRoomId,
          saturdaySubject: smClassRoutines.saturday,
          saturdayStart: smClassRoutines.saturdayStartFrom,
          saturdayEnd: smClassRoutines.saturdayEndTo,
          saturdayRoom: smClassRoutines.saturdayRoomId,
          sundaySubject: smClassRoutines.sunday,
          sundayStart: smClassRoutines.sundayStartFrom,
          sundayEnd: smClassRoutines.sundayEndTo,
          sundayRoom: smClassRoutines.sundayRoomId,
        })
        .from(smClassRoutines)
        .where(
          and(
            eq(smClassRoutines.classId, classId),
            eq(smClassRoutines.sectionId, sectionId),
            eq(smClassRoutines.schoolId, parent.schoolId),
            eq(smClassRoutines.activeStatus, 1),
          ),
        )
        .limit(1);

      if (legacy) {
        const pushLegacy = (
          day: keyof WeekSchedule,
          subject: string | null,
          start: string | null,
          end: string | null,
          room: number | null,
        ) => {
          if (subject === null && start === null && end === null) return;
          week[day].push({ startTime: start, endTime: end, subject, teacherName: null, roomId: room });
        };
        pushLegacy("monday", legacy.mondaySubject, legacy.mondayStart, legacy.mondayEnd, legacy.mondayRoom);
        pushLegacy("tuesday", legacy.tuesdaySubject, legacy.tuesdayStart, legacy.tuesdayEnd, legacy.tuesdayRoom);
        pushLegacy("wednesday", legacy.wednesdaySubject, legacy.wednesdayStart, legacy.wednesdayEnd, legacy.wednesdayRoom);
        pushLegacy("thursday", legacy.thursdaySubject, legacy.thursdayStart, legacy.thursdayEnd, legacy.thursdayRoom);
        pushLegacy("friday", legacy.fridaySubject, legacy.fridayStart, legacy.fridayEnd, legacy.fridayRoom);
        pushLegacy("saturday", legacy.saturdaySubject, legacy.saturdayStart, legacy.saturdayEnd, legacy.saturdayRoom);
        pushLegacy("sunday", legacy.sundaySubject, legacy.sundayStart, legacy.sundayEnd, legacy.sundayRoom);
      }
    }

    return {
      studentId: input.studentId,
      className: classRow?.name ?? null,
      sectionName: sectionRow?.name ?? null,
      weekSchedule: week,
    };
  },
});

// ─── 8. view-child-homework ──────────────────────────────────────────────────

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
    const parent = readParentContext(ctx as ToolExecuteContext);
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

// ─── 9. view-child-exam-schedule ─────────────────────────────────────────────

export const viewChildExamScheduleTool = createTool({
  id: "view-child-exam-schedule",
  description:
    "Return upcoming (or date-range filtered) exam entries for a child's class section, " +
    "including subject, time, room, and invigilating teacher.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
    fromDate: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) lower bound (defaults to today)"),
    toDate: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) upper bound"),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    exams: z.array(
      z.object({
        examId: z.number().nullable(),
        examTypeTitle: z.string().nullable(),
        subjectName: z.string().nullable(),
        date: z.string().nullable(),
        startTime: z.string().nullable(),
        endTime: z.string().nullable(),
        roomId: z.number().nullable(),
        teacherName: z.string().nullable(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx as ToolExecuteContext);
    assertParentOwnsStudent(parent, input.studentId);

    const { classId, sectionId } = await loadStudentClassSection(input.studentId);
    if (classId === null || sectionId === null) {
      return { studentId: input.studentId, exams: [] };
    }
    const lower = input.fromDate ?? todayIso();
    const db = await getDatabase();
    const rows = await db
      .select({
        examId: smExamSchedules.examId,
        examTypeTitle: smExamTypes.title,
        subjectName: smSubjects.subjectName,
        date: smExamSchedules.date,
        startTime: smExamSchedules.startTime,
        endTime: smExamSchedules.endTime,
        roomId: smExamSchedules.roomId,
        teacherName: smStaffs.fullName,
        examMark: smExams.examMark,
      })
      .from(smExamSchedules)
      .leftJoin(smExams, eq(smExamSchedules.examId, smExams.id))
      .leftJoin(smExamTypes, eq(smExamSchedules.examTermId, smExamTypes.id))
      .leftJoin(smSubjects, eq(smExamSchedules.subjectId, smSubjects.id))
      .leftJoin(smStaffs, eq(smExamSchedules.teacherId, smStaffs.id))
      .where(
        and(
          eq(smExamSchedules.classId, classId),
          eq(smExamSchedules.sectionId, sectionId),
          eq(smExamSchedules.schoolId, parent.schoolId),
          gte(smExamSchedules.date, lower),
          input.toDate ? lte(smExamSchedules.date, input.toDate) : undefined,
        ),
      )
      .orderBy(asc(smExamSchedules.date), asc(smExamSchedules.startTime));

    return {
      studentId: input.studentId,
      exams: rows.map((r) => ({
        examId: r.examId,
        examTypeTitle: r.examTypeTitle,
        subjectName: r.subjectName,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        roomId: r.roomId,
        teacherName: r.teacherName,
      })),
    };
  },
});

// ─── 10. view-child-fees ─────────────────────────────────────────────────────

export const viewChildFeesTool = createTool({
  id: "view-child-fees",
  description:
    "Return a child's fee assignments, payments, and running balance broken down by fees type.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    totalAssigned: z.number(),
    totalPaid: z.number(),
    balance: z.number(),
    items: z.array(
      z.object({
        feesType: z.string().nullable(),
        feesGroup: z.string().nullable(),
        amount: z.number().nullable(),
        dueDate: z.string().nullable(),
        paidAmount: z.number().nullable(),
        paymentDate: z.string().nullable(),
        paymentMode: z.string().nullable(),
        status: z.string(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx as ToolExecuteContext);
    assertParentOwnsStudent(parent, input.studentId);

    const schoolId = await loadStudentSchoolId(input.studentId);
    const db = await getDatabase();

    const assignments = await db
      .select({
        assignId: smFeesAssigns.id,
        amount: smFeesAssigns.feesAmount,
        feesType: smFeesTypes.name,
        feesGroup: smFeesGroups.name,
        activeStatus: smFeesAssigns.activeStatus,
      })
      .from(smFeesAssigns)
      .leftJoin(smFeesMasters, eq(smFeesAssigns.feesMasterId, smFeesMasters.id))
      .leftJoin(smFeesTypes, eq(smFeesMasters.feesTypeId, smFeesTypes.id))
      .leftJoin(smFeesGroups, eq(smFeesTypes.feesGroupId, smFeesGroups.id))
      .where(
        and(
          eq(smFeesAssigns.studentId, input.studentId),
          eq(smFeesAssigns.schoolId, schoolId),
        ),
      );

    const payments = await db
      .select({
        assignId: smFeesPayments.assignId,
        amount: smFeesPayments.amount,
        paymentDate: smFeesPayments.paymentDate,
        paymentMode: smFeesPayments.paymentMode,
        feesType: smFeesTypes.name,
        feesGroup: smFeesGroups.name,
      })
      .from(smFeesPayments)
      .leftJoin(smFeesTypes, eq(smFeesPayments.feesTypeId, smFeesTypes.id))
      .leftJoin(smFeesGroups, eq(smFeesTypes.feesGroupId, smFeesGroups.id))
      .where(
        and(
          eq(smFeesPayments.studentId, input.studentId),
          eq(smFeesPayments.schoolId, schoolId),
          eq(smFeesPayments.activeStatus, 1),
        ),
      );

    type Item = {
      feesType: string | null;
      feesGroup: string | null;
      amount: number | null;
      dueDate: string | null;
      paidAmount: number | null;
      paymentDate: string | null;
      paymentMode: string | null;
      status: string;
    };

    const items: Item[] = [];
    let totalAssigned = 0;
    let totalPaid = 0;

    if (assignments.length === 0 && payments.length > 0) {
      for (const p of payments) {
        const amount = p.amount !== null ? Number(p.amount) : null;
        if (amount !== null) totalPaid += amount;
        items.push({
          feesType: p.feesType,
          feesGroup: p.feesGroup,
          amount,
          dueDate: null,
          paidAmount: amount,
          paymentDate: p.paymentDate,
          paymentMode: p.paymentMode,
          status: amount !== null && amount > 0 ? "paid" : "unpaid",
        });
      }
    } else {
      for (const a of assignments) {
        const due = a.amount !== null ? Number(a.amount) : null;
        if (due !== null) totalAssigned += due;
        const related = payments.filter((p) => p.assignId === a.assignId);
        let paid = 0;
        let lastDate: string | null = null;
        let lastMode: string | null = null;
        for (const p of related) {
          const amt = p.amount !== null ? Number(p.amount) : 0;
          paid += amt;
          if (p.paymentDate !== null) lastDate = p.paymentDate;
          if (p.paymentMode !== null) lastMode = p.paymentMode;
        }
        totalPaid += paid;
        let status = "unpaid";
        if (due !== null) {
          if (paid >= due) status = "paid";
          else if (paid > 0) status = "partial";
        } else if (paid > 0) {
          status = "paid";
        }
        items.push({
          feesType: a.feesType,
          feesGroup: a.feesGroup,
          amount: due,
          dueDate: null,
          paidAmount: paid,
          paymentDate: lastDate,
          paymentMode: lastMode,
          status,
        });
      }
      for (const p of payments) {
        const stillOrphan = !assignments.some((a) => a.assignId === p.assignId);
        if (!stillOrphan) continue;
        const amt = p.amount !== null ? Number(p.amount) : null;
        if (amt !== null) totalPaid += amt;
        items.push({
          feesType: p.feesType,
          feesGroup: p.feesGroup,
          amount: null,
          dueDate: null,
          paidAmount: amt,
          paymentDate: p.paymentDate,
          paymentMode: p.paymentMode,
          status: amt !== null && amt > 0 ? "paid" : "unpaid",
        });
      }
    }

    return {
      studentId: input.studentId,
      totalAssigned,
      totalPaid,
      balance: totalAssigned - totalPaid,
      items,
    };
  },
});

// ─── 11. view-notice-board ───────────────────────────────────────────────────

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
    const parent = readParentContext(ctx as ToolExecuteContext);
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

// ─── 12. view-school-events ──────────────────────────────────────────────────

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
    const parent = readParentContext(ctx as ToolExecuteContext);
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

// ─── 13. view-holidays ───────────────────────────────────────────────────────

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
    const parent = readParentContext(ctx as ToolExecuteContext);
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
  viewHolidaysTool,
};

export type ParentTool = (typeof parentTools)[keyof typeof parentTools];
