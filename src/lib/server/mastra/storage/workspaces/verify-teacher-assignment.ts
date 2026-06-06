import { eq, and, sql } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import {
  smClassTeachers,
  smAssignClassTeachers,
} from "$lib/server/db/sms-schema";
import { WorkspaceMismatchError, type TenantContext } from "$lib/server/mastra/tenant-context";

/**
 * Confirms that the staff member bound to the active tenant context is
 * actively assigned to teach the `(classId, sectionId, academicId)` tuple.
 *
 * Used by the workspace filesystem resolver to fail fast when a teacher
 * attempts to access a class they do not own. The query joins:
 *   - `sm_class_teachers` (teacher slots with `activeStatus`)
 *   - `sm_assign_class_teachers` (class/section/school/academic-year header)
 *
 * Throws `WorkspaceMismatchError` if the staff member has no active slot
 * for the target class. Returns silently on success.
 */
export async function verifyTeacherAssignment(ctx: TenantContext): Promise<void> {
  if (ctx.classId === null || ctx.sectionId === null || ctx.academicId === null) {
    return;
  }

  const db = await getDatabase();

  const rows = await db
    .select({ one: sql<number>`1` })
    .from(smClassTeachers)
    .innerJoin(
      smAssignClassTeachers,
      eq(smAssignClassTeachers.id, smClassTeachers.assignClassTeacherId),
    )
    .where(
      and(
        eq(smClassTeachers.teacherId, ctx.staffId),
        eq(smClassTeachers.activeStatus, 1),
        eq(smAssignClassTeachers.schoolId, ctx.schoolId),
        eq(smAssignClassTeachers.classId, ctx.classId),
        eq(smAssignClassTeachers.sectionId, ctx.sectionId),
        eq(smAssignClassTeachers.academicId, ctx.academicId),
        eq(smAssignClassTeachers.activeStatus, 1),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new WorkspaceMismatchError(
      `Staff ${ctx.staffId} is not assigned to class ${ctx.classId}/section ${ctx.sectionId} for academic year ${ctx.academicId}`,
    );
  }
}
