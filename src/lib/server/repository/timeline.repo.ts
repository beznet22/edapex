// /src/lib/server/repository/student.repo.ts

import { and, eq } from "drizzle-orm";
import { smStaffs, smStudentTimelines } from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";

export type TimelineRow = typeof smStaffs.$inferSelect;
export type TimelinePayload = typeof smStudentTimelines.$inferInsert;

class TimelineRepository extends BaseRepository {
  // CRUD
  async createTimeline(payload: TimelinePayload) {
    const [res] = await this.db.insert(smStudentTimelines).values(payload).$returningId();
    return res?.id;
  }

  async createTimelineIfNotExist(payload: TimelinePayload) {
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
  }

  async getTimelinesByStudentId(studentId: number) {
    const academicId = await this.getAcademicId();
    return await this.db
      .select()
      .from(smStudentTimelines)
      .where(
        and(eq(smStudentTimelines.staffStudentId, studentId), eq(smStudentTimelines.academicId, academicId))
      );
  }

  async getTimelineById(id: number) {
    const academicId = await this.getAcademicId();
    const [res] = await this.db
      .select()
      .from(smStudentTimelines)
      .where(and(eq(smStudentTimelines.id, id), eq(smStudentTimelines.academicId, academicId)));
    return res;
  }

  async updateTimeline(id: number, payload: Partial<TimelinePayload>) {
    await this.db.update(smStudentTimelines).set(payload).where(eq(smStudentTimelines.id, id));
  }

  async deleteTimeline(id: number) {
    const academicId = await this.getAcademicId();
    await this.db
      .delete(smStudentTimelines)
      .where(and(eq(smStudentTimelines.id, id), eq(smStudentTimelines.academicId, academicId)));
  }

  async upsertTimeline(payload: TimelinePayload) {
    const { id, ...data } = payload;
    if (id) {
      await this.updateTimeline(id, data);
      return id;
    }
    return await this.createTimeline(data);
  }

  async getTimelinesByExam(studentId: number, examTypeId: number) {
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
  }
}

// ✅ Singleton export — the only one you need
export const timelineRepo = await TimelineRepository.build();
