// /src/lib/server/repository/student.repo.ts

import { and, eq } from "drizzle-orm";
import { smStaffs, smStudentTimelines } from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";

export type TimelineRow = typeof smStaffs.$inferSelect;
export type TimelinePayload = typeof smStudentTimelines.$inferInsert;

class TimelineRepository extends BaseRepository {
  // CRUD
  async createTimeline(payload: TimelinePayload) {
    return this.withErrorHandling(async () => {
      const [res] = await this.db.insert(smStudentTimelines).values(payload).$returningId();
      return res?.id;
    }, "createTimeline");
  }

  async createTimelineIfNotExist(payload: TimelinePayload) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const { staffStudentId, type } = payload;
      if (!staffStudentId || !type) return null;
      const [existing] = await this.db
        .select()
        .from(smStudentTimelines)
        .where(
          and(
            eq(smStudentTimelines.staffStudentId, staffStudentId),
            eq(smStudentTimelines.type, type),
            eq(smStudentTimelines.academicId, academicId)
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
        .from(smStudentTimelines)
        .where(
          and(eq(smStudentTimelines.staffStudentId, studentId), eq(smStudentTimelines.academicId, academicId))
        );
    }, "getTimelinesByStudentId");
  }

  async getTimelineById(id: number) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const [res] = await this.db
        .select()
        .from(smStudentTimelines)
        .where(and(eq(smStudentTimelines.id, id), eq(smStudentTimelines.academicId, academicId)));
      return res;
    }, "getTimelineById");
  }

  async updateTimeline(id: number, payload: Partial<TimelinePayload>) {
    return this.withErrorHandling(async () => {
      await this.db.update(smStudentTimelines).set(payload).where(eq(smStudentTimelines.id, id));
    }, "updateTimeline");
  }

  async deleteTimeline(id: number) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      await this.db
        .delete(smStudentTimelines)
        .where(and(eq(smStudentTimelines.id, id), eq(smStudentTimelines.academicId, academicId)));
    }, "deleteTimeline");
  }

  // insert or update
  async upsertTimelines(payload: TimelinePayload) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      const academicPayload = { ...payload, academicId };
      const [existing] = await this.getTimelinesByStudentId(academicPayload.staffStudentId);
      if (existing) {
        await this.updateTimeline(existing.id, academicPayload);
        return existing.id;
      }
      return await this.createTimeline(academicPayload);
    }, "upsertTimelines");
  }

  async getTimelinesByExam(studentId: number, examTypeId: number) {
    return this.withErrorHandling(async () => {
      const academicId = await this.getAcademicId();
      return await this.db
        .select()
        .from(smStudentTimelines)
        .where(
          and(
            eq(smStudentTimelines.staffStudentId, studentId),
            eq(smStudentTimelines.type, `exam-${examTypeId}`),
            eq(smStudentTimelines.academicId, academicId)
          )
        );
    }, "getTimelinesByExam");
  }
}

// ✅ Singleton export — the only one you need
export const timelineRepo = await TimelineRepository.build();
