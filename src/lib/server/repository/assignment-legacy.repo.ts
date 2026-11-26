import * as schema from "$lib/server/db/schema";
import { and, eq } from "drizzle-orm";
import { AssignmentReadRepository } from "./assignment-read.repo";

export const MAX_ASSIGNMENT_IDS = 50;

export class AssignmentConflictError extends Error {
  constructor(
    message = "A conflicting active assignment already exists for this class, section and subject"
  ) {
    super(message);
    this.name = "AssignmentConflictError";
  }
}

export class AssignmentReplaceRequiredError extends Error {
  constructor(public readonly offeringIds: number[]) {
    super("Replacing an existing teacher requires explicit confirmation");
    this.name = "AssignmentReplaceRequiredError";
  }
}

export const passAssignmentErrors = (error: unknown): boolean =>
  error instanceof AssignmentConflictError || error instanceof AssignmentReplaceRequiredError;

export function normalizeIds(ids: number[]): number[] {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) {
    throw new Error("At least one id is required");
  }
  if (unique.length > MAX_ASSIGNMENT_IDS) {
    throw new Error(`At most ${MAX_ASSIGNMENT_IDS} ids are allowed per request`);
  }
  return unique;
}

export class LegacyAssignmentRepository extends AssignmentReadRepository {
  async assignClassTeacher(params: {
    classId: number;
    sectionId: number;
    staffId: number;
    academicId?: number;
    sessionId?: number;
  }): Promise<{ assignClassTeacherId: number }> {
    return this.withErrorHandling(async () => {
      const {
        classId,
        sectionId,
        staffId,
        academicId: academicIdParam,
        sessionId: _sessionId,
      } = params;
      const academicId = academicIdParam ?? (await this.getAcademicId());

      const [existingHeader] = await this.db
        .select({ id: schema.smAssignClassTeachers.id })
        .from(schema.smAssignClassTeachers)
        .where(
          and(
            eq(schema.smAssignClassTeachers.schoolId, this.tenant.schoolId),
            eq(schema.smAssignClassTeachers.classId, classId),
            eq(schema.smAssignClassTeachers.sectionId, sectionId),
            eq(schema.smAssignClassTeachers.academicId, academicId)
          )
        )
        .limit(1);

      const headerId =
        existingHeader?.id ??
        (
          await this.db
            .insert(schema.smAssignClassTeachers)
            .values({
              schoolId: this.tenant.schoolId,
              classId,
              sectionId,
              academicId,
              activeStatus: 1,
              createdBy: this.tenant.userId,
              updatedBy: this.tenant.userId,
            })
            .$returningId()
        )[0].id;

      const [currentSlot] = await this.db
        .select({
          id: schema.smClassTeachers.id,
          teacherId: schema.smClassTeachers.teacherId,
        })
        .from(schema.smClassTeachers)
        .where(
          and(
            eq(schema.smClassTeachers.assignClassTeacherId, headerId),
            eq(schema.smClassTeachers.activeStatus, 1)
          )
        )
        .limit(1);

      if (!currentSlot || currentSlot.teacherId !== staffId) {
        if (currentSlot) {
          await this.db
            .update(schema.smClassTeachers)
            .set({
              activeStatus: 0,
              updatedBy: this.tenant.userId,
            })
            .where(eq(schema.smClassTeachers.id, currentSlot.id));
        }

        await this.db.insert(schema.smClassTeachers).values({
          assignClassTeacherId: headerId,
          teacherId: staffId,
          schoolId: this.tenant.schoolId,
          academicId,
          activeStatus: 1,
          createdBy: this.tenant.userId,
          updatedBy: this.tenant.userId,
        });
      }

      return { assignClassTeacherId: headerId };
    }, "assignClassTeacher");
  }

  async assignSubjectTeacher(params: {
    classId: number;
    sectionId: number;
    subjectId: number;
    staffId: number;
    academicId?: number;
    sessionId?: number;
  }): Promise<void> {
    return this.withErrorHandling(
      async () => {
        const {
          classId,
          sectionId,
          subjectId,
          staffId,
          academicId: academicIdParam,
          sessionId: _sessionId,
        } = params;
        const academicId = academicIdParam ?? (await this.getAcademicId());

        await this.db.transaction(async (tx) => {
          const rows = await tx
            .select({ id: schema.smAssignSubjects.id, teacherId: schema.smAssignSubjects.teacherId })
            .from(schema.smAssignSubjects)
            .where(
              and(
                eq(schema.smAssignSubjects.schoolId, this.tenant.schoolId),
                eq(schema.smAssignSubjects.classId, classId),
                eq(schema.smAssignSubjects.sectionId, sectionId),
                eq(schema.smAssignSubjects.subjectId, subjectId),
                eq(schema.smAssignSubjects.academicId, academicId),
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
              schoolId: this.tenant.schoolId,
              classId,
              sectionId,
              subjectId,
              teacherId: staffId,
              academicId,
              activeStatus: 1,
              createdBy: this.tenant.userId,
              updatedBy: this.tenant.userId,
            });
            return;
          }

          if (row.teacherId !== staffId) {
            await tx
              .update(schema.smAssignSubjects)
              .set({ teacherId: staffId, updatedBy: this.tenant.userId })
              .where(eq(schema.smAssignSubjects.id, row.id));
          }
        });
      },
      "assignSubjectTeacher",
      { passThrough: passAssignmentErrors }
    );
  }
}
