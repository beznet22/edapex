/**
 * Load the parent's children from the canonical student_records join.
 *
 * This is the source of truth for which students a parent can act on
 * from the Telegram bot. It MUST go through `student_records` (not just
 * `sm_students`) because:
 *   - `sm_students.classId/sectionId` is NULL for most rows. The
 *     authoritative per-academic-year class assignment lives in
 *     `student_records`.
 *   - Alumni (`student_records.isGraduate = 1`) must be filtered out
 *     so parents of graduated children don't see them in the picker.
 *   - A student with NO current `student_records` row (e.g. mid-rollover
 *     between academic years) cannot be delivered a PDF, so we filter
 *     them out at this layer rather than failing later in
 *     `_resolveStudentSession`.
 *
 * See the `getClassRoster` helper in
 * `src/lib/server/mastra/agents/skill-instructions.ts:128` for the same
 * join pattern.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smAcademicYears, smStudents, studentRecords } from "$lib/server/db/sms-schema";

export interface ChildCandidate {
  studentId: number;
  fullName: string;
  admissionNo: number | null;
}

/**
 * Return every active, non-graduated child the parent owns in the
 * supplied `academicId`. When `academicId` is null, the most recent
 * active academic year for the parent's school is used.
 */
export async function loadChildCandidates(
  parentId: number,
  academicId: number | null,
  schoolId: number,
): Promise<ChildCandidate[]> {
  const db = await getDatabase();
  const effectiveAcademicId = academicId ?? (await loadCurrentAcademicId(schoolId));
  const rows = await db
    .select({
      id: smStudents.id,
      fullName: smStudents.fullName,
      admissionNo: smStudents.admissionNo,
    })
    .from(smStudents)
    .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
    .where(
      and(
        eq(smStudents.parentId, parentId),
        eq(smStudents.activeStatus, 1),
        eq(studentRecords.activeStatus, 1),
        eq(studentRecords.isDefault, 1),
        eq(studentRecords.isGraduate, 0),
        eq(studentRecords.academicId, effectiveAcademicId),
      ),
    )
    .orderBy(asc(smStudents.fullName));

  return rows.flatMap((r) => {
    if (r.fullName === null) return [];
    return [
      {
        studentId: r.id,
        fullName: r.fullName,
        admissionNo: r.admissionNo,
      },
    ];
  });
}

/**
 * Resolve the most recent academic year for a school. Used when the
 * caller doesn't already know the `academicId` they want to scope by.
 */
export async function loadCurrentAcademicId(schoolId: number): Promise<number> {
  const db = await getDatabase();
  const [row] = await db
    .select({ id: smAcademicYears.id })
    .from(smAcademicYears)
    .where(eq(smAcademicYears.schoolId, schoolId))
    .orderBy(desc(smAcademicYears.id))
    .limit(1);
  return row?.id ?? 1;
}
