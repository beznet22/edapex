import { and, asc, eq, sql } from "drizzle-orm";

import { smClassSections, smClasses, smSections } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface SourceStructureCounts {
  readonly classes: number;
  readonly sections: number;
  readonly subjects: number;
  readonly assignments: number;
  readonly classTeachers: number;
  readonly routines: number;
  readonly gradeBands: number;
}

export async function countSourceStructure(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<SourceStructureCounts> {
  return withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;
    const row = await ctx.db.get<SourceStructureCounts>(sql`
      SELECT
        (SELECT COUNT(*) FROM sm_classes WHERE school_id = ${schoolId} AND academic_id = ${academicId} AND active_status = 1) AS classes,
        (SELECT COUNT(*) FROM sm_sections WHERE school_id = ${schoolId} AND academic_id = ${academicId} AND active_status = 1) AS sections,
        (SELECT COUNT(*) FROM sm_subjects WHERE school_id = ${schoolId} AND academic_id = ${academicId} AND active_status = 1) AS subjects,
        (SELECT COUNT(*) FROM sm_assign_subjects WHERE school_id = ${schoolId} AND academic_id = ${academicId} AND active_status = 1) AS assignments,
        (SELECT COUNT(*) FROM sm_assign_class_teachers WHERE school_id = ${schoolId} AND academic_id = ${academicId} AND active_status = 1) AS "classTeachers",
        (SELECT COUNT(*) FROM sm_class_routines WHERE school_id = ${schoolId} AND academic_id = ${academicId} AND active_status = 1) AS routines,
        (SELECT COUNT(*) FROM sm_marks_grades WHERE school_id = ${schoolId} AND academic_id = ${academicId}) AS "gradeBands"
    `);
    if (row === undefined) throw new Error("Source structure count returned no row");
    return row;
  }, "countSourceStructure");
}

export interface TargetClassSectionRow {
  readonly id: number;
  readonly classId: number;
  readonly className: string;
  readonly sectionId: number;
  readonly sectionName: string;
  readonly staffingStatus: "pending" | "copied" | "reviewed";
  readonly staffingReviewedAt: number | null;
  readonly staffingReviewedBy: number | null;
}

export async function listTargetClassSections(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<readonly TargetClassSectionRow[]> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({
        id: smClassSections.id,
        classId: smClasses.id,
        className: smClasses.className,
        sectionId: smSections.id,
        sectionName: smSections.sectionName,
        staffingStatus: smClassSections.staffingStatus,
        staffingReviewedAt: smClassSections.staffingReviewedAt,
        staffingReviewedBy: smClassSections.staffingReviewedBy
      })
      .from(smClassSections)
      .innerJoin(smClasses, eq(smClassSections.classId, smClasses.id))
      .innerJoin(smSections, eq(smClassSections.sectionId, smSections.id))
      .where(
        and(
          eq(smClassSections.schoolId, ctx.tenant.schoolId),
          eq(smClassSections.academicId, academicId),
          eq(smClassSections.activeStatus, 1),
          eq(smClasses.activeStatus, 1),
          eq(smSections.activeStatus, 1)
        )
      )
      .orderBy(asc(smClasses.sortOrder), asc(smSections.sectionName));
    return rows;
  }, "listTargetClassSections");
}

export async function ensureClassSections(
  ctx: ScopedRepositoryContext,
  input: { readonly academicId: number; readonly actorId: number }
): Promise<{ readonly created: number; readonly total: number }> {
  return withErrorHandling(async () => {
    const classes = await ctx.db
      .select({ id: smClasses.id })
      .from(smClasses)
      .where(
        and(
          eq(smClasses.schoolId, ctx.tenant.schoolId),
          eq(smClasses.academicId, input.academicId),
          eq(smClasses.activeStatus, 1)
        )
      );
    const sections = await ctx.db
      .select({ id: smSections.id })
      .from(smSections)
      .where(
        and(
          eq(smSections.schoolId, ctx.tenant.schoolId),
          eq(smSections.academicId, input.academicId),
          eq(smSections.activeStatus, 1)
        )
      );
    const existing = await ctx.db
      .select({
        classId: smClassSections.classId,
        sectionId: smClassSections.sectionId
      })
      .from(smClassSections)
      .where(
        and(
          eq(smClassSections.schoolId, ctx.tenant.schoolId),
          eq(smClassSections.academicId, input.academicId)
        )
      );
    const seen = new Set(existing.map((row) => `${row.classId}:${row.sectionId}`));
    let created = 0;
    for (const classRow of classes) {
      for (const section of sections) {
        const key = `${classRow.id}:${section.id}`;
        if (seen.has(key)) continue;
        await ctx.db.insert(smClassSections).values({
          activeStatus: 1,
          classId: classRow.id,
          sectionId: section.id,
          schoolId: ctx.tenant.schoolId,
          academicId: input.academicId,
          staffingStatus: "pending"
        });
        seen.add(key);
        created += 1;
      }
    }
    return { created, total: classes.length * sections.length };
  }, "ensureClassSections");
}
