import { and, eq } from "drizzle-orm";

import { smAssignClassTeachers, smClassTeachers } from "../../db/schema";
import type { SkippedStaffingRow } from "../base/copy-types";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

interface SourceClassTeacherHeader {
  readonly id: number;
  readonly classId: number | null;
  readonly sectionId: number | null;
}

interface SourceClassTeacherSlot {
  readonly id: number;
  readonly assignClassTeacherId: number | null;
  readonly teacherId: number | null;
  readonly staffActive: number | null;
  readonly userActive: number | null;
}

export interface ClassTeacherCopyInput {
  readonly classMap: ReadonlyMap<number, number>;
  readonly sectionMap: ReadonlyMap<number, number>;
  readonly targetAcademicId: number;
  readonly actorId: number;
}

export interface CopyClassTeachersResult {
  readonly copiedHeaders: number;
  readonly copiedSlots: number;
  readonly skipped: readonly SkippedStaffingRow[];
  readonly copiedSections: ReadonlySet<string>;
}

const now = () => Math.floor(Date.now() / 1000);

async function findOrCreateHeader(
  ctx: ScopedRepositoryContext,
  input: {
    readonly academicId: number;
    readonly classId: number;
    readonly sectionId: number;
    readonly actorId: number;
  }
): Promise<{ readonly id: number; readonly created: boolean }> {
  const [existing] = await ctx.db
    .select({ id: smAssignClassTeachers.id })
    .from(smAssignClassTeachers)
    .where(
      and(
        eq(smAssignClassTeachers.schoolId, ctx.tenant.schoolId),
        eq(smAssignClassTeachers.academicId, input.academicId),
        eq(smAssignClassTeachers.classId, input.classId),
        eq(smAssignClassTeachers.sectionId, input.sectionId)
      )
    )
    .limit(1);
  if (existing !== undefined) return { id: existing.id, created: false };
  const [inserted] = await ctx.db
    .insert(smAssignClassTeachers)
    .values({
      activeStatus: 1,
      classId: input.classId,
      sectionId: input.sectionId,
      schoolId: ctx.tenant.schoolId,
      academicId: input.academicId,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      createdAt: now(),
      updatedAt: now()
    })
    .returning({ id: smAssignClassTeachers.id });
  if (inserted === undefined) {
    throw new Error("Insert into sm_assign_class_teachers returned no row");
  }
  return { id: inserted.id, created: true };
}

export async function copyClassTeachers(
  ctx: ScopedRepositoryContext,
  input: ClassTeacherCopyInput,
  headers: readonly SourceClassTeacherHeader[],
  slots: readonly SourceClassTeacherSlot[]
): Promise<CopyClassTeachersResult> {
  return withErrorHandling(async () => {
    const skipped: SkippedStaffingRow[] = [];
    const copiedSections = new Set<string>();
    let copiedHeaders = 0;
    let copiedSlots = 0;

    for (const header of headers) {
      const classId =
        header.classId === null ? null : input.classMap.get(header.classId) ?? null;
      const sectionId =
        header.sectionId === null ? null : input.sectionMap.get(header.sectionId) ?? null;
      if (classId === null || sectionId === null) {
        skipped.push({
          sourceId: header.id,
          teacherId: null,
          reason: "MAPPING_MISSING",
          classId,
          sectionId,
          subjectId: null
        });
        continue;
      }
      const targetHeader = await findOrCreateHeader(ctx, {
        academicId: input.targetAcademicId,
        classId,
        sectionId,
        actorId: input.actorId
      });
      if (targetHeader.created) copiedHeaders += 1;

      for (const slot of slots) {
        if (slot.assignClassTeacherId !== header.id) continue;
        if (slot.teacherId === null || slot.staffActive !== 1 || slot.userActive !== 1) {
          skipped.push({
            sourceId: slot.id,
            teacherId: slot.teacherId,
            reason:
              slot.teacherId === null || slot.staffActive === null
                ? "TEACHER_MISSING"
                : slot.staffActive !== 1
                  ? "TEACHER_INACTIVE"
                  : "TEACHER_USER_INACTIVE",
            classId,
            sectionId,
            subjectId: null
          });
          continue;
        }
        const [existingSlot] = await ctx.db
          .select({ id: smClassTeachers.id })
          .from(smClassTeachers)
          .where(
            and(
              eq(smClassTeachers.schoolId, ctx.tenant.schoolId),
              eq(smClassTeachers.assignClassTeacherId, targetHeader.id),
              eq(smClassTeachers.teacherId, slot.teacherId),
              eq(smClassTeachers.activeStatus, 1)
            )
          )
          .limit(1);
        if (existingSlot !== undefined) {
          copiedSections.add(`${classId}:${sectionId}`);
          continue;
        }
        await ctx.db.insert(smClassTeachers).values({
          activeStatus: 1,
          teacherId: slot.teacherId,
          assignClassTeacherId: targetHeader.id,
          schoolId: ctx.tenant.schoolId,
          academicId: input.targetAcademicId,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: now(),
          updatedAt: now()
        });
        copiedSlots += 1;
        copiedSections.add(`${classId}:${sectionId}`);
      }
    }

    return { copiedHeaders, copiedSlots, skipped, copiedSections };
  }, "copyClassTeachers");
}
