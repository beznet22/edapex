import { sql } from "drizzle-orm";

import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface QuarantineRow {
  readonly studentId: number;
  readonly fullName: string | null;
  readonly admissionNo: number | null;
  readonly guardianName: string | null;
  readonly guardianPhone: string | null;
  readonly className: string | null;
  readonly reason: "NO_CURRENT_RECORD" | "UNPLACED";
}

export async function findTargetSectionId(
  ctx: ScopedRepositoryContext,
  input: {
    readonly targetAcademicId: number;
    readonly targetClassId: number;
    readonly sectionName: string;
  }
): Promise<number | null> {
  return withErrorHandling(async () => {
    const row = await ctx.db.get<{ sectionId: number }>(sql`
      SELECT sec.id AS sectionId
      FROM sm_class_sections cs
      INNER JOIN sm_sections sec ON sec.id = cs.section_id
      WHERE cs.school_id = ${ctx.tenant.schoolId}
        AND cs.academic_id = ${input.targetAcademicId}
        AND cs.class_id = ${input.targetClassId}
        AND sec.section_name = ${input.sectionName}
        AND cs.active_status = 1
      LIMIT 1
    `);
    return row === undefined ? null : Number(row.sectionId);
  }, "findTargetSectionId");
}

export async function findSectionName(
  ctx: ScopedRepositoryContext,
  sectionId: number
): Promise<string | null> {
  return withErrorHandling(async () => {
    const row = await ctx.db.get<{ sectionName: string }>(sql`
      SELECT section_name AS sectionName FROM sm_sections
      WHERE id = ${sectionId} AND school_id = ${ctx.tenant.schoolId}
      LIMIT 1
    `);
    return row === undefined ? null : String(row.sectionName);
  }, "findSectionName");
}

export async function listQuarantineRows(
  ctx: ScopedRepositoryContext,
  sourceAcademicId: number
): Promise<readonly QuarantineRow[]> {
  return withErrorHandling(async () => {
    const missing = await ctx.db.all<QuarantineRow>(sql`
      SELECT s.id AS studentId, s.full_name AS fullName, s.admission_no AS admissionNo,
             p.guardians_name AS guardianName, p.guardians_mobile AS guardianPhone,
             c.class_name AS className, 'NO_CURRENT_RECORD' AS reason
      FROM sm_students s
      LEFT JOIN sm_parents p ON p.id = s.parent_id
      LEFT JOIN sm_classes c ON c.id = s.class_id
      WHERE s.school_id = ${ctx.tenant.schoolId}
        AND NOT EXISTS (
          SELECT 1 FROM student_records r
          WHERE r.student_id = s.id AND r.school_id = s.school_id
            AND r.academic_id = ${sourceAcademicId}
        )
      ORDER BY c.class_name, s.full_name
    `);
    const unplaced = await ctx.db.all<QuarantineRow>(sql`
      SELECT s.id AS studentId, s.full_name AS fullName, s.admission_no AS admissionNo,
             p.guardians_name AS guardianName, p.guardians_mobile AS guardianPhone,
             c.class_name AS className, 'UNPLACED' AS reason
      FROM sm_students s
      INNER JOIN student_records r ON r.student_id = s.id AND r.school_id = s.school_id
        AND r.academic_id = ${sourceAcademicId}
      LEFT JOIN sm_classes c ON c.id = r.class_id
      LEFT JOIN sm_parents p ON p.id = s.parent_id
      WHERE s.school_id = ${ctx.tenant.schoolId}
        AND (r.class_id IS NULL OR c.next_class_id IS NULL)
      ORDER BY c.class_name, s.full_name
    `);
    return [...missing, ...unplaced];
  }, "listQuarantineRows");
}
