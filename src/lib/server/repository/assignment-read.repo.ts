import * as schema from "$lib/server/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { BaseRepository } from "./base.repo";
import type {
  ConflictRawRow,
  OfferingRow,
  SubjectOption,
} from "$lib/server/people/people-types";

export class AssignmentReadRepository extends BaseRepository {
  async listSubjectOptions(params: {
    schoolId: number;
    academicId: number;
  }): Promise<SubjectOption[]> {
    const { schoolId, academicId } = params;
    return this.withErrorHandling(async () => {
      const rows = await this.db
        .select({
          id: schema.smSubjects.id,
          subjectName: schema.smSubjects.subjectName,
          subjectCode: schema.smSubjects.subjectCode,
          subjectType: schema.smSubjects.subjectType,
        })
        .from(schema.smSubjects)
        .where(
          and(
            eq(schema.smSubjects.schoolId, schoolId),
            eq(schema.smSubjects.academicId, academicId),
            eq(schema.smSubjects.activeStatus, 1)
          )
        )
        .orderBy(asc(schema.smSubjects.subjectName));

      return rows.map((row) => ({
        id: row.id,
        subjectName: row.subjectName,
        subjectCode: row.subjectCode,
        subjectType: row.subjectType === "P" ? "P" : "T",
      }));
    }, "listSubjectOptions");
  }

  async listOfferings(params: {
    schoolId: number;
    academicId: number;
    classId: number;
    sectionId: number;
  }): Promise<OfferingRow[]> {
    const { schoolId, academicId, classId, sectionId } = params;
    return this.withErrorHandling(async () => {
      const rows = await this.db
        .select({
          id: schema.smAssignSubjects.id,
          classId: schema.smAssignSubjects.classId,
          sectionId: schema.smAssignSubjects.sectionId,
          subjectId: schema.smAssignSubjects.subjectId,
          subjectName: schema.smSubjects.subjectName,
          teacherId: schema.smAssignSubjects.teacherId,
          teacherName: schema.smStaffs.fullName,
          activeStatus: schema.smAssignSubjects.activeStatus,
        })
        .from(schema.smAssignSubjects)
        .leftJoin(schema.smSubjects, eq(schema.smSubjects.id, schema.smAssignSubjects.subjectId))
        .leftJoin(schema.smStaffs, eq(schema.smStaffs.id, schema.smAssignSubjects.teacherId))
        .where(
          and(
            eq(schema.smAssignSubjects.schoolId, schoolId),
            eq(schema.smAssignSubjects.academicId, academicId),
            eq(schema.smAssignSubjects.classId, classId),
            eq(schema.smAssignSubjects.sectionId, sectionId),
            eq(schema.smAssignSubjects.activeStatus, 1)
          )
        )
        .orderBy(asc(schema.smSubjects.subjectName));

      const offerings: OfferingRow[] = [];
      for (const row of rows) {
        if (row.subjectId === null || row.classId === null || row.sectionId === null) continue;
        offerings.push({
          id: row.id,
          classId: row.classId,
          sectionId: row.sectionId,
          subjectId: row.subjectId,
          subjectName: row.subjectName,
          teacherId: row.teacherId,
          teacherName: row.teacherName,
          active: row.activeStatus === 1,
        });
      }
      return offerings;
    }, "listOfferings");
  }

  async listConflicts(params: {
    schoolId: number;
    academicId: number;
  }): Promise<ConflictRawRow[]> {
    const { schoolId, academicId } = params;
    return this.withErrorHandling(async () => {
      return await this.db
        .select({
          classId: schema.smAssignSubjects.classId,
          sectionId: schema.smAssignSubjects.sectionId,
          subjectId: schema.smAssignSubjects.subjectId,
          activeTeachers: sql<number>`COUNT(*)`,
          teacherIds: sql<string>`GROUP_CONCAT(${schema.smAssignSubjects.teacherId} ORDER BY ${schema.smAssignSubjects.teacherId})`,
        })
        .from(schema.smAssignSubjects)
        .where(
          and(
            eq(schema.smAssignSubjects.schoolId, schoolId),
            eq(schema.smAssignSubjects.academicId, academicId),
            eq(schema.smAssignSubjects.activeStatus, 1)
          )
        )
        .groupBy(
          schema.smAssignSubjects.classId,
          schema.smAssignSubjects.sectionId,
          schema.smAssignSubjects.subjectId
        )
        .having(sql`COUNT(*) > 1`)
        .orderBy(
          asc(schema.smAssignSubjects.classId),
          asc(schema.smAssignSubjects.sectionId),
          asc(schema.smAssignSubjects.subjectId)
        );
    }, "listConflicts");
  }

  async getEligibility(params: {
    staffId: number;
    schoolId: number;
    academicId: number;
  }): Promise<{ activeAssignments: number }> {
    const { staffId, schoolId, academicId } = params;
    return this.withErrorHandling(async () => {
      const [row] = await this.db
        .select({ activeAssignments: sql<number>`COUNT(*)` })
        .from(schema.smAssignSubjects)
        .where(
          and(
            eq(schema.smAssignSubjects.teacherId, staffId),
            eq(schema.smAssignSubjects.schoolId, schoolId),
            eq(schema.smAssignSubjects.academicId, academicId),
            eq(schema.smAssignSubjects.activeStatus, 1)
          )
        );
      return { activeAssignments: Number(row?.activeAssignments ?? 0) };
    }, "getEligibility");
  }
}
