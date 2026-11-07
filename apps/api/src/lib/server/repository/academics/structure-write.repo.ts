import { and, asc, eq } from "drizzle-orm";

import { smClassSections, smSections, smSubjects } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface CopyStructureResult {
  readonly map: ReadonlyMap<number, number>;
  readonly created: number;
  readonly added: number;
}

const now = () => Math.floor(Date.now() / 1000);

export async function copySections(
  ctx: ScopedRepositoryContext,
  input: { readonly sourceAcademicId: number; readonly targetAcademicId: number; readonly actorId: number }
): Promise<CopyStructureResult> {
  return withErrorHandling(async () => {
    const source = await ctx.db
      .select()
      .from(smSections)
      .where(
        and(
          eq(smSections.schoolId, ctx.tenant.schoolId),
          eq(smSections.academicId, input.sourceAcademicId),
          eq(smSections.activeStatus, 1)
        )
      )
      .orderBy(asc(smSections.id));
    const map = new Map<number, number>();
    let created = 0;
    for (const row of source) {
      const [existing] = await ctx.db
        .select({ id: smSections.id })
        .from(smSections)
        .where(
          and(
            eq(smSections.schoolId, ctx.tenant.schoolId),
            eq(smSections.academicId, input.targetAcademicId),
            eq(smSections.sectionName, row.sectionName)
          )
        )
        .limit(1);
      let targetId = existing?.id;
      if (targetId === undefined) {
        const [inserted] = await ctx.db
          .insert(smSections)
          .values({
            sectionName: row.sectionName,
            activeStatus: 1,
            parentId: row.parentId,
            schoolId: ctx.tenant.schoolId,
            academicId: input.targetAcademicId,
            createdBy: input.actorId,
            updatedBy: input.actorId,
            createdAt: now(),
            updatedAt: now()
          })
          .returning({ id: smSections.id });
        if (inserted === undefined) throw new Error("Insert into sm_sections returned no row");
        targetId = inserted.id;
        created += 1;
      }
      map.set(row.id, targetId);
    }
    return { map, created, added: 0 };
  }, "copySections");
}

export async function copySubjects(
  ctx: ScopedRepositoryContext,
  input: { readonly sourceAcademicId: number; readonly targetAcademicId: number; readonly actorId: number }
): Promise<CopyStructureResult> {
  return withErrorHandling(async () => {
    const source = await ctx.db
      .select()
      .from(smSubjects)
      .where(
        and(
          eq(smSubjects.schoolId, ctx.tenant.schoolId),
          eq(smSubjects.academicId, input.sourceAcademicId),
          eq(smSubjects.activeStatus, 1)
        )
      )
      .orderBy(asc(smSubjects.id));
    const map = new Map<number, number>();
    let created = 0;
    for (const row of source) {
      const [existing] = await ctx.db
        .select({ id: smSubjects.id })
        .from(smSubjects)
        .where(
          and(
            eq(smSubjects.schoolId, ctx.tenant.schoolId),
            eq(smSubjects.academicId, input.targetAcademicId),
            eq(smSubjects.subjectName, row.subjectName)
          )
        )
        .limit(1);
      let targetId = existing?.id;
      if (targetId === undefined) {
        const [inserted] = await ctx.db
          .insert(smSubjects)
          .values({
            subjectName: row.subjectName,
            subjectCode: row.subjectCode,
            passMark: row.passMark,
            subjectType: row.subjectType,
            activeStatus: 1,
            parentId: row.parentId,
            schoolId: ctx.tenant.schoolId,
            academicId: input.targetAcademicId,
            createdBy: input.actorId,
            updatedBy: input.actorId,
            createdAt: now(),
            updatedAt: now()
          })
          .returning({ id: smSubjects.id });
        if (inserted === undefined) throw new Error("Insert into sm_subjects returned no row");
        targetId = inserted.id;
        created += 1;
      }
      map.set(row.id, targetId);
    }
    return { map, created, added: 0 };
  }, "copySubjects");
}

export async function setStaffingStatus(
  ctx: ScopedRepositoryContext,
  input: {
    readonly academicId: number;
    readonly classId: number;
    readonly sectionId: number;
    readonly status: "pending" | "copied";
  }
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(smClassSections)
      .set({ staffingStatus: input.status, updatedAt: now() })
      .where(
        and(
          eq(smClassSections.schoolId, ctx.tenant.schoolId),
          eq(smClassSections.academicId, input.academicId),
          eq(smClassSections.classId, input.classId),
          eq(smClassSections.sectionId, input.sectionId),
          eq(smClassSections.staffingStatus, "pending")
        )
      );
  }, "setStaffingStatus");
}

export async function markStaffingReviewed(
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
  }, "markStaffingReviewed");
}
