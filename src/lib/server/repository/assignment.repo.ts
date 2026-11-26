import * as schema from "$lib/server/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  AssignmentConflictError,
  AssignmentReplaceRequiredError,
  LegacyAssignmentRepository,
  normalizeIds,
  passAssignmentErrors,
} from "./assignment-legacy.repo";

export {
  AssignmentConflictError,
  AssignmentReplaceRequiredError,
  MAX_ASSIGNMENT_IDS,
} from "./assignment-legacy.repo";

export class AssignmentRepository extends LegacyAssignmentRepository {
  async createOfferings(params: {
    schoolId: number;
    academicId: number;
    classId: number;
    sectionId: number;
    subjectIds: number[];
    actorId: number;
  }): Promise<{ created: number; reactivated: number; skipped: number }> {
    const { schoolId, academicId, classId, sectionId, actorId } = params;
    const subjectIds = normalizeIds(params.subjectIds);
    return this.withErrorHandling(async () => {
      return await this.db.transaction(async (tx) => {
        const existing = await tx
          .select({
            id: schema.smAssignSubjects.id,
            subjectId: schema.smAssignSubjects.subjectId,
            activeStatus: schema.smAssignSubjects.activeStatus,
          })
          .from(schema.smAssignSubjects)
          .where(
            and(
              eq(schema.smAssignSubjects.schoolId, schoolId),
              eq(schema.smAssignSubjects.academicId, academicId),
              eq(schema.smAssignSubjects.classId, classId),
              eq(schema.smAssignSubjects.sectionId, sectionId),
              inArray(schema.smAssignSubjects.subjectId, subjectIds)
            )
          );

        const existingBySubject = new Map<number, { id: number; activeStatus: number }>();
        for (const row of existing) {
          if (row.subjectId === null) continue;
          existingBySubject.set(row.subjectId, { id: row.id, activeStatus: row.activeStatus });
        }

        const reactivateIds: number[] = [];
        const createSubjectIds: number[] = [];
        let skipped = 0;
        for (const subjectId of subjectIds) {
          const found = existingBySubject.get(subjectId);
          if (!found) createSubjectIds.push(subjectId);
          else if (found.activeStatus === 1) skipped += 1;
          else reactivateIds.push(found.id);
        }

        if (reactivateIds.length > 0) {
          await tx
            .update(schema.smAssignSubjects)
            .set({ activeStatus: 1, teacherId: null, updatedBy: actorId })
            .where(
              and(
                inArray(schema.smAssignSubjects.id, reactivateIds),
                eq(schema.smAssignSubjects.schoolId, schoolId),
                eq(schema.smAssignSubjects.academicId, academicId)
              )
            );
        }

        if (createSubjectIds.length > 0) {
          await tx.insert(schema.smAssignSubjects).values(
            createSubjectIds.map((subjectId) => ({
              schoolId,
              classId,
              sectionId,
              subjectId,
              teacherId: null,
              academicId,
              activeStatus: 1,
              createdBy: actorId,
              updatedBy: actorId,
            }))
          );
        }

        return {
          created: createSubjectIds.length,
          reactivated: reactivateIds.length,
          skipped,
        };
      });
    }, "createOfferings");
  }

  async assignOfferingTeacher(params: {
    schoolId: number;
    academicId: number;
    offeringIds: number[];
    teacherId: number;
    replace: boolean;
    actorId: number;
  }): Promise<{ updated: number; skipped: number }> {
    const { schoolId, academicId, teacherId, replace, actorId } = params;
    const offeringIds = normalizeIds(params.offeringIds);
    return this.withErrorHandling(
      async () => {
        return await this.db.transaction(async (tx) => {
          const rows = await tx
            .select({
              id: schema.smAssignSubjects.id,
              teacherId: schema.smAssignSubjects.teacherId,
              activeCount: sql<number>`(
                SELECT COUNT(*) FROM sm_assign_subjects a2
                WHERE a2.school_id = sm_assign_subjects.school_id
                  AND a2.academic_id = sm_assign_subjects.academic_id
                  AND a2.class_id = sm_assign_subjects.class_id
                  AND a2.section_id = sm_assign_subjects.section_id
                  AND a2.subject_id = sm_assign_subjects.subject_id
                  AND a2.active_status = 1
              )`,
            })
            .from(schema.smAssignSubjects)
            .where(
              and(
                inArray(schema.smAssignSubjects.id, offeringIds),
                eq(schema.smAssignSubjects.schoolId, schoolId),
                eq(schema.smAssignSubjects.academicId, academicId),
                eq(schema.smAssignSubjects.activeStatus, 1)
              )
            )
            .for("update");

          if (rows.length !== offeringIds.length) {
            throw new Error("One or more offerings are not active assignments for this school");
          }
          if (rows.some((row) => Number(row.activeCount) > 1)) {
            throw new AssignmentConflictError();
          }

          const replaceRequiredIds = rows
            .filter((row) => row.teacherId !== null && row.teacherId !== teacherId)
            .map((row) => row.id);
          if (replaceRequiredIds.length > 0 && !replace) {
            throw new AssignmentReplaceRequiredError(replaceRequiredIds);
          }

          const updateIds = rows
            .filter((row) => row.teacherId !== teacherId)
            .map((row) => row.id);
          const skipped = rows.length - updateIds.length;

          if (updateIds.length > 0) {
            await tx
              .update(schema.smAssignSubjects)
              .set({ teacherId, updatedBy: actorId })
              .where(
                and(
                  inArray(schema.smAssignSubjects.id, updateIds),
                  eq(schema.smAssignSubjects.schoolId, schoolId),
                  eq(schema.smAssignSubjects.academicId, academicId)
                )
              );
          }

          return { updated: updateIds.length, skipped };
        });
      },
      "assignOfferingTeacher",
      { passThrough: passAssignmentErrors }
    );
  }

  async selfAssign(params: {
    schoolId: number;
    academicId: number;
    staffId: number;
    classId: number;
    sectionId: number;
    subjectIds: number[];
    actorId: number;
  }): Promise<{ assigned: number; alreadyAssigned: number }> {
    const { schoolId, academicId, staffId, classId, sectionId, actorId } = params;
    const subjectIds = normalizeIds(params.subjectIds).sort((a, b) => a - b);
    return this.withErrorHandling(
      async () => {
        return await this.db.transaction(async (tx) => {
          let assigned = 0;
          let alreadyAssigned = 0;

          for (const subjectId of subjectIds) {
            const rows = await tx
              .select({
                id: schema.smAssignSubjects.id,
                teacherId: schema.smAssignSubjects.teacherId,
              })
              .from(schema.smAssignSubjects)
              .where(
                and(
                  eq(schema.smAssignSubjects.schoolId, schoolId),
                  eq(schema.smAssignSubjects.academicId, academicId),
                  eq(schema.smAssignSubjects.classId, classId),
                  eq(schema.smAssignSubjects.sectionId, sectionId),
                  eq(schema.smAssignSubjects.subjectId, subjectId),
                  eq(schema.smAssignSubjects.activeStatus, 1)
                )
              )
              .for("update");

            if (rows.length > 1) {
              throw new AssignmentConflictError();
            }

            const row = rows[0];
            if (!row) {
              await tx.insert(schema.smAssignSubjects).values({
                schoolId,
                academicId,
                classId,
                sectionId,
                subjectId,
                teacherId: staffId,
                activeStatus: 1,
                createdBy: actorId,
                updatedBy: actorId,
              });
              assigned += 1;
            } else if (row.teacherId === staffId) {
              alreadyAssigned += 1;
            } else if (row.teacherId !== null) {
              throw new AssignmentConflictError(
                "This subject is already assigned to another teacher. Ask an administrator to resolve it."
              );
            } else {
              await tx
                .update(schema.smAssignSubjects)
                .set({ teacherId: staffId, updatedBy: actorId })
                .where(eq(schema.smAssignSubjects.id, row.id));
              assigned += 1;
            }
          }

          return { assigned, alreadyAssigned };
        });
      },
      "selfAssign",
      { passThrough: passAssignmentErrors }
    );
  }

  async resolveConflict(params: {
    schoolId: number;
    academicId: number;
    classId: number;
    sectionId: number;
    subjectId: number;
    keepRowId: number;
    actorId: number;
  }): Promise<{ deactivated: number }> {
    const { schoolId, academicId, classId, sectionId, subjectId, keepRowId, actorId } = params;
    return this.withErrorHandling(async () => {
      const keepIsActive = sql`EXISTS (
        SELECT 1 FROM (
          SELECT id, school_id, academic_id, class_id, section_id, subject_id, active_status
          FROM sm_assign_subjects
        ) AS keep
        WHERE keep.id = ${keepRowId}
          AND keep.school_id = ${schoolId}
          AND keep.academic_id = ${academicId}
          AND keep.class_id = ${classId}
          AND keep.section_id = ${sectionId}
          AND keep.subject_id = ${subjectId}
          AND keep.active_status = 1
      )`;

      const [result] = await this.db
        .update(schema.smAssignSubjects)
        .set({ activeStatus: 0, updatedBy: actorId })
        .where(
          and(
            eq(schema.smAssignSubjects.schoolId, schoolId),
            eq(schema.smAssignSubjects.academicId, academicId),
            eq(schema.smAssignSubjects.classId, classId),
            eq(schema.smAssignSubjects.sectionId, sectionId),
            eq(schema.smAssignSubjects.subjectId, subjectId),
            eq(schema.smAssignSubjects.activeStatus, 1),
            sql`${schema.smAssignSubjects.id} <> ${keepRowId}`,
            keepIsActive
          )
        );

      return { deactivated: Number(result?.affectedRows ?? 0) };
    }, "resolveConflict");
  }

  async deactivateAssignment(params: {
    offeringId: number;
    schoolId: number;
    academicId: number;
    actorId: number;
  }): Promise<{ deactivated: boolean }> {
    const { offeringId, schoolId, academicId, actorId } = params;
    return this.withErrorHandling(async () => {
      const [result] = await this.db
        .update(schema.smAssignSubjects)
        .set({ activeStatus: 0, updatedBy: actorId })
        .where(
          and(
            eq(schema.smAssignSubjects.id, offeringId),
            eq(schema.smAssignSubjects.schoolId, schoolId),
            eq(schema.smAssignSubjects.academicId, academicId)
          )
        );
      return { deactivated: Number(result?.affectedRows ?? 0) > 0 };
    }, "deactivateAssignment");
  }
}
