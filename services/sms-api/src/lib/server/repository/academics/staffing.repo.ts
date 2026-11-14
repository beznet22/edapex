import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import {
  smAssignClassTeachers,
  smAssignSubjects,
  smClassSections,
  smClassTeachers,
  smClasses,
  smSections,
  smSubjects
} from "../../db/schema";
import { batchOrThrow, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

const now = () => Math.floor(Date.now() / 1000);

export async function replaceAssignments(
  ctx: ScopedRepositoryContext,
  input: {
    readonly academicId: number;
    readonly classId: number;
    readonly sectionId: number;
    readonly actorId: number;
    readonly assignments: readonly { readonly subjectId: number; readonly staffId: number }[];
  }
): Promise<void> {
  await withErrorHandling(async () => {
    const deactivate = ctx.db
      .update(smAssignSubjects)
      .set({ activeStatus: 0, updatedBy: input.actorId, updatedAt: now() })
      .where(
        and(
          eq(smAssignSubjects.schoolId, ctx.tenant.schoolId),
          eq(smAssignSubjects.academicId, input.academicId),
          eq(smAssignSubjects.classId, input.classId),
          eq(smAssignSubjects.sectionId, input.sectionId),
          eq(smAssignSubjects.activeStatus, 1)
        )
      );
    const rows = input.assignments.map((assignment) => ({
      activeStatus: 1,
      teacherId: assignment.staffId,
      classId: input.classId,
      sectionId: input.sectionId,
      subjectId: assignment.subjectId,
      schoolId: ctx.tenant.schoolId,
      academicId: input.academicId,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      createdAt: now(),
      updatedAt: now()
    }));
    const statements = [deactivate, ...chunkedInsert(ctx.db, smAssignSubjects, rows, 1)];
    await batchOrThrow(ctx.db, statements);
  }, "replaceAssignments");
}

export async function replaceClassTeacher(
  ctx: ScopedRepositoryContext,
  input: {
    readonly academicId: number;
    readonly classId: number;
    readonly sectionId: number;
    readonly actorId: number;
    readonly staffId: number | null;
  }
): Promise<void> {
  await withErrorHandling(async () => {
    const [header] = await ctx.db
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
    let headerId = header?.id;
    if (headerId === undefined) {
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
      headerId = inserted.id;
    }
    const resolvedHeaderId = headerId;
    const deactivate = ctx.db
      .update(smClassTeachers)
      .set({ activeStatus: 0, updatedBy: input.actorId, updatedAt: now() })
      .where(
        and(
          eq(smClassTeachers.schoolId, ctx.tenant.schoolId),
          eq(smClassTeachers.assignClassTeacherId, resolvedHeaderId),
          eq(smClassTeachers.activeStatus, 1)
        )
      );
    const statements: BatchItem<"sqlite">[] = [deactivate];
    if (input.staffId !== null) {
      statements.push(
        ctx.db.insert(smClassTeachers).values({
          activeStatus: 1,
          teacherId: input.staffId,
          assignClassTeacherId: resolvedHeaderId,
          schoolId: ctx.tenant.schoolId,
          academicId: input.academicId,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: now(),
          updatedAt: now()
        })
      );
    }
    await batchOrThrow(ctx.db, statements);
  }, "replaceClassTeacher");
}

export async function markReviewed(
  ctx: ScopedRepositoryContext,
  input: {
    readonly academicId: number;
    readonly classId: number;
    readonly sectionId: number;
    readonly actorId: number;
  }
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(smClassSections)
      .set({
        staffingStatus: "reviewed",
        staffingReviewedAt: now(),
        staffingReviewedBy: input.actorId,
        updatedAt: now()
      })
      .where(
        and(
          eq(smClassSections.schoolId, ctx.tenant.schoolId),
          eq(smClassSections.academicId, input.academicId),
          eq(smClassSections.classId, input.classId),
          eq(smClassSections.sectionId, input.sectionId)
        )
      );
  }, "markReviewed");
}

export async function subjectIdsForYear(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<ReadonlySet<number>> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({ id: smSubjects.id })
      .from(smSubjects)
      .where(
        and(
          eq(smSubjects.schoolId, ctx.tenant.schoolId),
          eq(smSubjects.academicId, academicId),
          eq(smSubjects.activeStatus, 1)
        )
      );
    return new Set(rows.map((row) => row.id));
  }, "subjectIdsForYear");
}

export async function findTargetSection(
  ctx: ScopedRepositoryContext,
  academicId: number,
  classId: number,
  sectionId: number
): Promise<{
  readonly classId: number;
  readonly className: string;
  readonly sectionId: number;
  readonly sectionName: string;
} | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        classId: smClasses.id,
        className: smClasses.className,
        sectionId: smSections.id,
        sectionName: smSections.sectionName
      })
      .from(smClasses)
      .innerJoin(smSections, eq(smSections.id, sectionId))
      .innerJoin(
        smClassSections,
        and(
          eq(smClassSections.classId, smClasses.id),
          eq(smClassSections.sectionId, smSections.id),
          eq(smClassSections.academicId, academicId),
          eq(smClassSections.schoolId, ctx.tenant.schoolId)
        )
      )
      .where(
        and(
          eq(smClasses.id, classId),
          eq(smClasses.schoolId, ctx.tenant.schoolId),
          eq(smClasses.academicId, academicId),
          eq(smSections.schoolId, ctx.tenant.schoolId),
          eq(smSections.academicId, academicId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findTargetSection");
}
