import { classAttendances } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface ClassAttendanceInput {
  readonly studentId: number | null;
  readonly examTypeId: number | null;
  readonly daysOpened?: number | null;
  readonly daysAbsent?: number | null;
  readonly daysPresent?: number | null;
}

/**
 * Upsert on the `(student_id, exam_type_id)` natural key (`O8`). Missing
 * student or term returns null, as the legacy method did.
 */
export async function upsertClassAttendance(
  ctx: ScopedRepositoryContext,
  input: ClassAttendanceInput
): Promise<number | null> {
  return withErrorHandling(async () => {
    if (input.studentId === null || input.examTypeId === null) return null;

    const now = Math.floor(Date.now() / 1000);
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;

    const rows = await ctx.db
      .insert(classAttendances)
      .values({
        studentId: input.studentId,
        examTypeId: input.examTypeId,
        daysOpened: input.daysOpened ?? null,
        daysAbsent: input.daysAbsent ?? null,
        daysPresent: input.daysPresent ?? null,
        academicId,
        schoolId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [classAttendances.studentId, classAttendances.examTypeId],
        set: {
          daysOpened: input.daysOpened ?? null,
          daysAbsent: input.daysAbsent ?? null,
          daysPresent: input.daysPresent ?? null,
          academicId,
          schoolId,
          updatedAt: now
        }
      })
      .returning({ id: classAttendances.id });

    const [row] = rows;
    return row?.id ?? null;
  }, "upsertClassAttendance");
}
