/**
 * Cross-aggregate reads for the Phase 7 bootstrap/staffing surface.
 *
 * `queries/` is the only repository aggregate allowed to join across owners;
 * the write repositories (`academics`, `assessments`, `reference`) receive the
 * rows these functions return.
 */
import { and, desc, eq } from "drizzle-orm";

import {
  smAssignClassTeachers,
  smAssignSubjects,
  smClassSections,
  smClassTeachers,
  smClasses,
  smSections,
  smStaffs,
  smSubjects,
  users
} from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface SourceAssignmentRow {
  readonly id: number;
  readonly teacherId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly subjectId: number | null;
  readonly staffActive: number | null;
  readonly userActive: number | null;
}

export interface SourceClassTeacherHeader {
  readonly id: number;
  readonly classId: number | null;
  readonly sectionId: number | null;
}

export interface SourceClassTeacherSlot {
  readonly id: number;
  readonly assignClassTeacherId: number | null;
  readonly teacherId: number | null;
  readonly staffActive: number | null;
  readonly userActive: number | null;
}

export interface StaffingAssignmentRow {
  readonly subjectId: number;
  readonly subjectName: string | null;
  readonly staffId: number | null;
  readonly staffName: string | null;
}

export interface StaffingSectionRow {
  readonly id: number;
  readonly classId: number;
  readonly className: string;
  readonly sectionId: number;
  readonly sectionName: string;
  readonly staffingStatus: "pending" | "copied" | "reviewed";
  readonly staffingReviewedAt: number | null;
  readonly staffingReviewedBy: number | null;
  readonly classTeacher: { readonly staffId: number; readonly staffName: string | null } | null;
  readonly assignments: readonly StaffingAssignmentRow[];
  readonly assignmentCount: number;
}

export async function listSourceSubjectAssignments(
  ctx: ScopedRepositoryContext,
  sourceAcademicId: number
): Promise<readonly SourceAssignmentRow[]> {
  return withErrorHandling(async () => {
    return ctx.db
      .select({
        id: smAssignSubjects.id,
        teacherId: smAssignSubjects.teacherId,
        classId: smAssignSubjects.classId,
        sectionId: smAssignSubjects.sectionId,
        subjectId: smAssignSubjects.subjectId,
        staffActive: smStaffs.activeStatus,
        userActive: users.activeStatus
      })
      .from(smAssignSubjects)
      .leftJoin(smStaffs, eq(smAssignSubjects.teacherId, smStaffs.id))
      .leftJoin(users, eq(smStaffs.userId, users.id))
      .where(
        and(
          eq(smAssignSubjects.schoolId, ctx.tenant.schoolId),
          eq(smAssignSubjects.academicId, sourceAcademicId),
          eq(smAssignSubjects.activeStatus, 1)
        )
      );
  }, "listSourceSubjectAssignments");
}

export async function listSourceClassTeacherData(
  ctx: ScopedRepositoryContext,
  sourceAcademicId: number
): Promise<{
  readonly headers: readonly SourceClassTeacherHeader[];
  readonly slots: readonly SourceClassTeacherSlot[];
}> {
  return withErrorHandling(async () => {
    const headers = await ctx.db
      .select({
        id: smAssignClassTeachers.id,
        classId: smAssignClassTeachers.classId,
        sectionId: smAssignClassTeachers.sectionId
      })
      .from(smAssignClassTeachers)
      .where(
        and(
          eq(smAssignClassTeachers.schoolId, ctx.tenant.schoolId),
          eq(smAssignClassTeachers.academicId, sourceAcademicId),
          eq(smAssignClassTeachers.activeStatus, 1)
        )
      );
    const slots = await ctx.db
      .select({
        id: smClassTeachers.id,
        assignClassTeacherId: smClassTeachers.assignClassTeacherId,
        teacherId: smClassTeachers.teacherId,
        staffActive: smStaffs.activeStatus,
        userActive: users.activeStatus
      })
      .from(smClassTeachers)
      .leftJoin(smStaffs, eq(smClassTeachers.teacherId, smStaffs.id))
      .leftJoin(users, eq(smStaffs.userId, users.id))
      .where(
        and(
          eq(smClassTeachers.schoolId, ctx.tenant.schoolId),
          eq(smClassTeachers.academicId, sourceAcademicId),
          eq(smClassTeachers.activeStatus, 1)
        )
      );
    return { headers, slots };
  }, "listSourceClassTeacherData");
}

async function findClassTeacher(
  ctx: ScopedRepositoryContext,
  academicId: number,
  classId: number,
  sectionId: number
): Promise<StaffingSectionRow["classTeacher"]> {
  const [row] = await ctx.db
    .select({ staffId: smStaffs.id, staffName: smStaffs.fullName })
    .from(smClassTeachers)
    .innerJoin(
      smAssignClassTeachers,
      eq(smClassTeachers.assignClassTeacherId, smAssignClassTeachers.id)
    )
    .innerJoin(smStaffs, eq(smClassTeachers.teacherId, smStaffs.id))
    .where(
      and(
        eq(smClassTeachers.schoolId, ctx.tenant.schoolId),
        eq(smClassTeachers.activeStatus, 1),
        eq(smAssignClassTeachers.schoolId, ctx.tenant.schoolId),
        eq(smAssignClassTeachers.academicId, academicId),
        eq(smAssignClassTeachers.classId, classId),
        eq(smAssignClassTeachers.sectionId, sectionId)
      )
    )
    .orderBy(desc(smClassTeachers.id))
    .limit(1);
  return row === undefined ? null : { staffId: row.staffId, staffName: row.staffName };
}

async function listActiveAssignments(
  ctx: ScopedRepositoryContext,
  academicId: number,
  classId: number,
  sectionId: number
): Promise<readonly StaffingAssignmentRow[]> {
  const rows = await ctx.db
    .select({
      subjectId: smAssignSubjects.subjectId,
      subjectName: smSubjects.subjectName,
      staffId: smAssignSubjects.teacherId,
      staffName: smStaffs.fullName
    })
    .from(smAssignSubjects)
    .leftJoin(smSubjects, eq(smAssignSubjects.subjectId, smSubjects.id))
    .leftJoin(smStaffs, eq(smAssignSubjects.teacherId, smStaffs.id))
    .where(
      and(
        eq(smAssignSubjects.schoolId, ctx.tenant.schoolId),
        eq(smAssignSubjects.academicId, academicId),
        eq(smAssignSubjects.classId, classId),
        eq(smAssignSubjects.sectionId, sectionId),
        eq(smAssignSubjects.activeStatus, 1)
      )
    )
    .orderBy(smSubjects.subjectName);
  return rows
    .filter((row) => row.subjectId !== null)
    .map((row) => ({
      subjectId: row.subjectId ?? 0,
      subjectName: row.subjectName,
      staffId: row.staffId,
      staffName: row.staffName
    }));
}

export async function listStaffingSections(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<readonly StaffingSectionRow[]> {
  return withErrorHandling(async () => {
    const sections = await ctx.db
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
      .orderBy(smClasses.sortOrder, smSections.sectionName);
    const out: StaffingSectionRow[] = [];
    for (const section of sections) {
      const [classTeacher, assignments] = await Promise.all([
        findClassTeacher(ctx, academicId, section.classId, section.sectionId),
        listActiveAssignments(ctx, academicId, section.classId, section.sectionId)
      ]);
      out.push({
        ...section,
        classTeacher,
        assignments,
        assignmentCount: assignments.length
      });
    }
    return out;
  }, "listStaffingSections");
}

export async function findCopyableTeacher(
  ctx: ScopedRepositoryContext,
  teacherId: number
): Promise<boolean> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ staffActive: smStaffs.activeStatus, userActive: users.activeStatus })
      .from(smStaffs)
      .leftJoin(users, eq(smStaffs.userId, users.id))
      .where(and(eq(smStaffs.id, teacherId), eq(smStaffs.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    return row !== undefined && row.staffActive === 1 && row.userActive === 1;
  }, "findCopyableTeacher");
}
