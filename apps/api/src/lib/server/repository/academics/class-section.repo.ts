import { and, eq, like, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import {
  smAssignSubjects,
  smClassSections,
  smClasses,
  smSections
} from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface ClassSectionRow {
  readonly id: number;
  readonly classId: number | null;
  readonly className: string | null;
  readonly sectionId: number | null;
  readonly sectionName: string | null;
  readonly academicId: number | null;
}

export interface AssignedClassSectionRow {
  readonly id: number | null;
  readonly classId: number | null;
  readonly className: string | null;
  readonly sectionId: number | null;
  readonly sectionName: string | null;
  readonly academicId: number | null;
}

export interface ClassSectionSearchRow {
  readonly classId: number;
  readonly className: string;
  readonly sectionId: number;
  readonly sectionName: string;
}

export interface AssignedClassSectionFilters {
  readonly staffId?: number;
  readonly classId?: number;
  readonly sectionId?: number;
}

const classSectionColumns = {
  id: smClassSections.id,
  classId: smClassSections.classId,
  className: smClasses.className,
  sectionId: smClassSections.sectionId,
  sectionName: smSections.sectionName,
  academicId: smClassSections.academicId
} as const;

export async function findClassSectionById(
  ctx: ScopedRepositoryContext,
  classId: number,
  sectionId: number
): Promise<ClassSectionRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select(classSectionColumns)
      .from(smClassSections)
      .leftJoin(smClasses, eq(smClassSections.classId, smClasses.id))
      .leftJoin(smSections, eq(smClassSections.sectionId, smSections.id))
      .where(
        and(
          eq(smClassSections.classId, classId),
          eq(smClassSections.sectionId, sectionId),
          eq(smClassSections.activeStatus, 1),
          eq(smClassSections.academicId, requireAcademicId(ctx)),
          eq(smClassSections.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findClassSectionById");
}

export async function listClassSections(
  ctx: ScopedRepositoryContext
): Promise<readonly ClassSectionRow[]> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    return ctx.db
      .select(classSectionColumns)
      .from(smClassSections)
      .leftJoin(smClasses, eq(smClassSections.classId, smClasses.id))
      .leftJoin(smSections, eq(smClassSections.sectionId, smSections.id))
      .where(
        and(
          eq(smClassSections.activeStatus, 1),
          eq(smClasses.activeStatus, 1),
          eq(smSections.activeStatus, 1),
          eq(smClassSections.schoolId, ctx.tenant.schoolId),
          eq(smClasses.schoolId, ctx.tenant.schoolId),
          eq(smSections.schoolId, ctx.tenant.schoolId),
          eq(smClassSections.academicId, academicId)
        )
      )
      .orderBy(smClassSections.classId);
  }, "listClassSections");
}

export async function findClassSectionByName(
  ctx: ScopedRepositoryContext,
  className: string,
  sectionName: string
): Promise<{ readonly classId: number; readonly sectionId: number } | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ classId: smClasses.id, sectionId: smSections.id })
      .from(smClassSections)
      .innerJoin(smClasses, eq(smClassSections.classId, smClasses.id))
      .innerJoin(smSections, eq(smClassSections.sectionId, smSections.id))
      .where(
        and(
          eq(smClasses.className, className.toUpperCase()),
          eq(smSections.sectionName, sectionName.toUpperCase()),
          eq(smClasses.activeStatus, 1),
          eq(smSections.activeStatus, 1),
          eq(smClassSections.activeStatus, 1),
          eq(smClasses.academicId, requireAcademicId(ctx)),
          eq(smClassSections.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findClassSectionByName");
}

export async function searchClassSections(
  ctx: ScopedRepositoryContext,
  query?: string
): Promise<readonly ClassSectionSearchRow[]> {
  return withErrorHandling(async () => {
    const filters: SQL<unknown>[] = [
      eq(smClasses.activeStatus, 1),
      eq(smSections.activeStatus, 1),
      eq(smClassSections.activeStatus, 1),
      eq(smClasses.academicId, requireAcademicId(ctx)),
      eq(smClassSections.schoolId, ctx.tenant.schoolId)
    ];
    if (query !== undefined && query.length > 0) {
      const pattern = `%${query.toUpperCase()}%`;
      filters.push(
        like(
          sql`${smClasses.className} || ' ' || ${smSections.sectionName}`,
          pattern
        )
      );
    }
    return ctx.db
      .select({
        classId: smClasses.id,
        className: smClasses.className,
        sectionId: smSections.id,
        sectionName: smSections.sectionName
      })
      .from(smClassSections)
      .innerJoin(smClasses, eq(smClassSections.classId, smClasses.id))
      .innerJoin(smSections, eq(smClassSections.sectionId, smSections.id))
      .where(and(...filters))
      .limit(20);
  }, "searchClassSections");
}

export async function findAssignedClassSection(
  ctx: ScopedRepositoryContext,
  filters: AssignedClassSectionFilters = {}
): Promise<AssignedClassSectionRow | null> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const conditions: SQL<unknown>[] = [
      eq(smAssignSubjects.activeStatus, 1),
      eq(smAssignSubjects.academicId, academicId),
      eq(smAssignSubjects.schoolId, ctx.tenant.schoolId)
    ];
    if (filters.staffId !== undefined) {
      conditions.push(eq(smAssignSubjects.teacherId, filters.staffId));
    }
    if (filters.classId !== undefined) {
      conditions.push(eq(smAssignSubjects.classId, filters.classId));
    }
    if (filters.sectionId !== undefined) {
      conditions.push(eq(smAssignSubjects.sectionId, filters.sectionId));
    }

    const [row] = await ctx.db
      .select({
        id: smClassSections.id,
        classId: smAssignSubjects.classId,
        className: smClasses.className,
        sectionId: smAssignSubjects.sectionId,
        sectionName: smSections.sectionName,
        academicId: smClassSections.academicId
      })
      .from(smAssignSubjects)
      .leftJoin(smClasses, eq(smAssignSubjects.classId, smClasses.id))
      .leftJoin(smSections, eq(smAssignSubjects.sectionId, smSections.id))
      .leftJoin(
        smClassSections,
        and(
          eq(smClassSections.classId, smAssignSubjects.classId),
          eq(smClassSections.sectionId, smAssignSubjects.sectionId),
          eq(smClassSections.academicId, academicId)
        )
      )
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }, "findAssignedClassSection");
}
