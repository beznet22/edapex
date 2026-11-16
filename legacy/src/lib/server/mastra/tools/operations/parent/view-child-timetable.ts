import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, asc, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import {
  smClasses,
  smClassRoutineUpdates,
  smClassRoutines,
  smSections,
  smStaffs,
  smSubjects,
} from "$lib/server/db/sms-schema";
import { assertParentOwnsStudent } from "../../internal/parent-permissions";
import { loadStudentClassSection, readParentContext } from "./index";

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
    const parent = readParentContext(ctx);
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