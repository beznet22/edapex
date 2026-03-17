import { and, eq } from "drizzle-orm";
import { timelines } from "$lib/server/db/schema";
import { BaseRepository } from "./base.repo";

type TimelineRow = typeof timelines.$inferSelect;
type TimelinePayload = typeof timelines.$inferInsert;

export class TimelineRepository extends BaseRepository {
  // CRUD
  async createTimeline(payload: TimelinePayload) {
    return this.withErrorHandling(async () => {
      const tenantId = await this.getTenantId();
      const academicId = await this.getAcademicId();
      
      const [res] = await this.db.insert(timelines).values({
        ...payload,
        tenantId,
        academicId: payload.academicId || academicId
      }).$returningId();
      
      return res?.id;
    }, "createTimeline");
  }

  async createTimelineIfNotExist(payload: TimelinePayload) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const { userId, type } = payload;
      if (!userId || !type) return null;
      
      const [existing] = await this.db
        .select()
        .from(timelines)
        .where(
          and(
            eq(timelines.userId, userId),
            eq(timelines.type, type),
            eq(timelines.academicId, payload.academicId || academicId)
          )
        )
        .limit(1);
        
      if (existing) return existing.id;
      return await this.createTimeline(payload);
    }, "createTimelineIfNotExist");
  }

  async getTimelinesByStudentId(studentId: number) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      return await this.db
        .select()
        .from(timelines)
        .where(
          and(eq(timelines.userId, studentId), eq(timelines.academicId, academicId))
        );
    }, "getTimelinesByStudentId");
  }

  async getTimelineById(id: number) {
    return this.withErrorHandling(async () => {
      const [res] = await this.db
        .select()
        .from(timelines)
        .where(eq(timelines.id, id));
      return res;
    }, "getTimelineById");
  }

  async updateTimeline(id: number, payload: Partial<TimelinePayload>) {
    return this.withErrorHandling(async () => {
      await this.db.update(timelines).set(payload).where(eq(timelines.id, id));
    }, "updateTimeline");
  }

  async deleteTimeline(id: number) {
    return this.withErrorHandling(async () => {
      await this.db
        .delete(timelines)
        .where(eq(timelines.id, id));
    }, "deleteTimeline");
  }

  // insert or update
  async upsertTimelines(payload: TimelinePayload) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const userId = payload.userId;
      
      const [existing] = await this.db
      .select()
      .from(timelines)
      .where(
        and(
          eq(timelines.userId, userId),
          eq(timelines.type, payload.type),
          eq(timelines.academicId, payload.academicId || academicId)
        )
      )
      .limit(1);

      if (existing) {
        await this.updateTimeline(existing.id, payload);
        return existing.id;
      }
      return await this.createTimeline(payload);
    }, "upsertTimelines");
  }

  async getTimelinesByExam(studentId: number, examTypeId: number) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      return await this.db
        .select()
        .from(timelines)
        .where(
          and(
            eq(timelines.userId, studentId),
            eq(timelines.type, `exam-${examTypeId}`),
            eq(timelines.academicId, academicId)
          )
        );
    }, "getTimelinesByExam");
  }
}
