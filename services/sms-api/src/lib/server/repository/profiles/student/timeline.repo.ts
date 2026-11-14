import { and, eq } from "drizzle-orm";

import { smStudentTimelines } from "../../../db/schema";
import { withErrorHandling } from "../../base/error-handling";
import { requireAcademicId } from "../../base/repository-context";
import type { ScopedRepositoryContext } from "../../base/repository-context";

export type TimelineRow = typeof smStudentTimelines.$inferSelect;
export type NewTimeline = typeof smStudentTimelines.$inferInsert;

export type TimelinePatch = Partial<
  Pick<
    NewTimeline,
    | "title"
    | "date"
    | "description"
    | "file"
    | "type"
    | "visibleToStudent"
    | "activeStatus"
  >
>;

export async function createTimeline(
  ctx: ScopedRepositoryContext,
  payload: NewTimeline
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .insert(smStudentTimelines)
      .values({
        ...payload,
        schoolId: ctx.tenant.schoolId,
        academicId: payload.academicId ?? requireAcademicId(ctx)
      })
      .returning({ id: smStudentTimelines.id });
    const [row] = rows;
    if (row === undefined) throw new Error("Insert into sm_student_timelines returned no id");
    return row.id;
  }, "createTimeline");
}

export async function createTimelineIfNotExist(
  ctx: ScopedRepositoryContext,
  payload: NewTimeline
): Promise<number | null> {
  return withErrorHandling(async () => {
    const academicId = payload.academicId ?? requireAcademicId(ctx);
    if (payload.staffStudentId <= 0 || payload.type === null || payload.type === undefined) {
      return null;
    }
    const [existing] = await ctx.db
      .select({ id: smStudentTimelines.id })
      .from(smStudentTimelines)
      .where(
        and(
          eq(smStudentTimelines.staffStudentId, payload.staffStudentId),
          eq(smStudentTimelines.type, payload.type),
          eq(smStudentTimelines.academicId, academicId),
          eq(smStudentTimelines.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    if (existing !== undefined) return existing.id;

    const rows = await ctx.db
      .insert(smStudentTimelines)
      .values({ ...payload, academicId, schoolId: ctx.tenant.schoolId })
      .returning({ id: smStudentTimelines.id });
    return rows[0]?.id ?? null;
  }, "createTimelineIfNotExist");
}

export async function listTimelinesByStudent(
  ctx: ScopedRepositoryContext,
  studentId: number
): Promise<readonly TimelineRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(smStudentTimelines)
        .where(
          and(
            eq(smStudentTimelines.staffStudentId, studentId),
            eq(smStudentTimelines.academicId, requireAcademicId(ctx)),
            eq(smStudentTimelines.schoolId, ctx.tenant.schoolId)
          )
        ),
    "listTimelinesByStudent"
  );
}

export async function findTimelineById(
  ctx: ScopedRepositoryContext,
  id: number
): Promise<TimelineRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(smStudentTimelines)
      .where(
        and(
          eq(smStudentTimelines.id, id),
          eq(smStudentTimelines.academicId, requireAcademicId(ctx)),
          eq(smStudentTimelines.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findTimelineById");
}

export async function updateTimeline(
  ctx: ScopedRepositoryContext,
  id: number,
  patch: TimelinePatch
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .update(smStudentTimelines)
        .set(patch)
        .where(
          and(
            eq(smStudentTimelines.id, id),
            eq(smStudentTimelines.schoolId, ctx.tenant.schoolId)
          )
        );
    },
    "updateTimeline"
  );
}

export async function deleteTimeline(
  ctx: ScopedRepositoryContext,
  id: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .delete(smStudentTimelines)
        .where(
          and(
            eq(smStudentTimelines.id, id),
            eq(smStudentTimelines.academicId, requireAcademicId(ctx)),
            eq(smStudentTimelines.schoolId, ctx.tenant.schoolId)
          )
        );
    },
    "deleteTimeline"
  );
}

/** One timeline per student per academic year, matching the legacy upsert. */
export async function upsertTimelines(
  ctx: ScopedRepositoryContext,
  payload: NewTimeline
): Promise<number> {
  return withErrorHandling(async () => {
    const academicId = payload.academicId ?? requireAcademicId(ctx);
    const [existing] = await ctx.db
      .select({ id: smStudentTimelines.id })
      .from(smStudentTimelines)
      .where(
        and(
          eq(smStudentTimelines.staffStudentId, payload.staffStudentId),
          eq(smStudentTimelines.academicId, academicId),
          eq(smStudentTimelines.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);

    if (existing !== undefined) {
      await ctx.db
        .update(smStudentTimelines)
        .set(payload)
        .where(eq(smStudentTimelines.id, existing.id));
      return existing.id;
    }

    const rows = await ctx.db
      .insert(smStudentTimelines)
      .values({ ...payload, academicId, schoolId: ctx.tenant.schoolId })
      .returning({ id: smStudentTimelines.id });
    const [row] = rows;
    if (row === undefined) throw new Error("Insert into sm_student_timelines returned no id");
    return row.id;
  }, "upsertTimelines");
}

export async function listTimelinesByExam(
  ctx: ScopedRepositoryContext,
  studentId: number,
  examTypeId: number
): Promise<readonly TimelineRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(smStudentTimelines)
        .where(
          and(
            eq(smStudentTimelines.staffStudentId, studentId),
            eq(smStudentTimelines.type, `exam-${examTypeId}`),
            eq(smStudentTimelines.academicId, requireAcademicId(ctx)),
            eq(smStudentTimelines.schoolId, ctx.tenant.schoolId)
          )
        ),
    "listTimelinesByExam"
  );
}
