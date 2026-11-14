import { sql } from "drizzle-orm";

import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface IntegrityCounts {
  readonly p3: number;
  readonly p4: number;
  readonly f1: number;
  readonly f2: number;
  readonly d1: number;
  readonly d2: number;
  readonly r1: number;
  readonly r2: number;
  readonly r3: number;
  readonly c1: number;
  readonly s1: number;
  readonly termDates: number;
  readonly staffingPending: number;
  readonly staffingReviewed: number;
  readonly unstaffedUnreviewed: number;
  readonly unstaffedTotal: number;
  readonly teachersWithoutClasses: number;
  readonly duplicateCurrentRecords: number;
  readonly targetCurrentRecords: number;
}

/**
 * One round trip for the whole integrity report. The identity checks are
 * school-wide; the target checks are scoped to the session being reviewed.
 */
export async function readIntegrityCounts(
  ctx: ScopedRepositoryContext,
  sessionId: number
): Promise<IntegrityCounts> {
  return withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;
    const row = await ctx.db.get<IntegrityCounts>(sql`
      SELECT
        (SELECT COUNT(*) FROM sm_parents p
          LEFT JOIN users u ON u.id = p.user_id
          WHERE p.school_id = ${schoolId}
            AND COALESCE(p.guardians_name, '') NOT LIKE 'PLACEHOLDER%'
            AND (p.user_id IS NULL OR u.id IS NULL)) AS p3,
        (SELECT COUNT(*) FROM users u
          WHERE u.school_id = ${schoolId}
            AND u.active_status = 1
            AND lower(COALESCE(u.is_administrator, 'no')) <> 'yes'
            AND NOT EXISTS (SELECT 1 FROM sm_students s WHERE s.user_id = u.id AND s.school_id = ${schoolId})
            AND NOT EXISTS (SELECT 1 FROM sm_staffs st WHERE st.user_id = u.id AND st.school_id = ${schoolId})
            AND NOT EXISTS (SELECT 1 FROM sm_parents p WHERE p.user_id = u.id AND p.school_id = ${schoolId})) AS p4,
        (SELECT COUNT(*) FROM sm_students s
          LEFT JOIN sm_parents p ON p.id = s.parent_id
          WHERE s.school_id = ${schoolId} AND (s.parent_id IS NULL OR p.id IS NULL)) AS f1,
        (SELECT COUNT(*) FROM sm_parents p
          WHERE p.school_id = ${schoolId}
            AND NOT EXISTS (SELECT 1 FROM sm_students s WHERE s.parent_id = p.id AND s.school_id = ${schoolId})) AS f2,
        (SELECT COUNT(*) FROM (
          SELECT user_id FROM sm_parents
          WHERE school_id = ${schoolId} AND user_id IS NOT NULL
          GROUP BY user_id HAVING COUNT(*) > 1
        )) AS d1,
        (SELECT COUNT(*) FROM (
          SELECT lower(email) AS email FROM users
          WHERE school_id = ${schoolId} AND email IS NOT NULL AND trim(email) <> ''
          GROUP BY lower(email) HAVING COUNT(*) > 1
        )) AS d2,
        (SELECT COUNT(*) FROM sm_students s
          WHERE s.school_id = ${schoolId}
            AND NOT EXISTS (SELECT 1 FROM student_records r WHERE r.student_id = s.id AND r.school_id = ${schoolId})) AS r1,
        (SELECT COUNT(*) FROM sm_students s
          WHERE s.school_id = ${schoolId}
            AND EXISTS (SELECT 1 FROM student_records r WHERE r.student_id = s.id AND r.school_id = ${schoolId})
            AND NOT EXISTS (SELECT 1 FROM student_records r WHERE r.student_id = s.id AND r.school_id = ${schoolId} AND r.is_default = 1)) AS r2,
        (SELECT COUNT(*) FROM (
          SELECT student_id FROM student_records
          WHERE school_id = ${schoolId} AND is_default = 1
          GROUP BY student_id HAVING COUNT(*) > 1
        )) AS r3,
        (SELECT COUNT(*) FROM sm_students s
          LEFT JOIN student_records r ON r.student_id = s.id AND r.school_id = ${schoolId} AND r.is_default = 1
          WHERE s.school_id = ${schoolId} AND s.class_id IS NOT NULL
            AND (r.id IS NULL OR r.class_id IS NULL OR r.class_id <> s.class_id)) AS c1,
        (SELECT COUNT(*) FROM sm_assign_subjects a
          LEFT JOIN sm_staffs st ON st.id = a.teacher_id
          WHERE a.school_id = ${schoolId} AND a.active_status = 1
            AND (a.teacher_id IS NULL OR st.id IS NULL OR st.active_status = 0)) AS s1,
        (SELECT COUNT(*) FROM sm_exam_types t
          WHERE t.school_id = ${schoolId} AND t.academic_id = ${sessionId}
            AND t.status IN ('active', 'planned')
            AND (t.starts_on IS NULL OR t.ends_on IS NULL)) AS "termDates",
        (SELECT COUNT(*) FROM sm_class_sections cs
          WHERE cs.school_id = ${schoolId} AND cs.academic_id = ${sessionId}
            AND cs.active_status = 1 AND cs.staffing_status <> 'reviewed') AS "staffingPending",
        (SELECT COUNT(*) FROM sm_class_sections cs
          WHERE cs.school_id = ${schoolId} AND cs.academic_id = ${sessionId}
            AND cs.active_status = 1 AND cs.staffing_status = 'reviewed') AS "staffingReviewed",
        (SELECT COUNT(*) FROM sm_class_sections cs
          WHERE cs.school_id = ${schoolId} AND cs.academic_id = ${sessionId}
            AND cs.active_status = 1 AND cs.staffing_status <> 'reviewed'
            AND NOT EXISTS (
              SELECT 1 FROM sm_assign_subjects a
              WHERE a.school_id = cs.school_id AND a.academic_id = cs.academic_id
                AND a.class_id = cs.class_id AND a.section_id = cs.section_id
                AND a.active_status = 1
            )) AS "unstaffedUnreviewed",
        (SELECT COUNT(*) FROM sm_class_sections cs
          WHERE cs.school_id = ${schoolId} AND cs.academic_id = ${sessionId}
            AND cs.active_status = 1
            AND NOT EXISTS (
              SELECT 1 FROM sm_assign_subjects a
              WHERE a.school_id = cs.school_id AND a.academic_id = cs.academic_id
                AND a.class_id = cs.class_id AND a.section_id = cs.section_id
                AND a.active_status = 1
            )) AS "unstaffedTotal",
        (SELECT COUNT(*) FROM sm_staffs st
          WHERE st.school_id = ${schoolId} AND st.active_status = 1
            AND NOT EXISTS (
              SELECT 1 FROM sm_assign_subjects a
              WHERE a.school_id = st.school_id AND a.academic_id = ${sessionId}
                AND a.teacher_id = st.id AND a.active_status = 1
            )) AS "teachersWithoutClasses",
        (SELECT COUNT(*) FROM (
          SELECT student_id FROM student_records
          WHERE school_id = ${schoolId} AND academic_id = ${sessionId} AND is_default = 1
          GROUP BY student_id HAVING COUNT(*) > 1
        )) AS "duplicateCurrentRecords",
        (SELECT COUNT(*) FROM student_records r
          WHERE r.school_id = ${schoolId} AND r.academic_id = ${sessionId} AND r.is_default = 1) AS "targetCurrentRecords"
    `);
    if (row === undefined) throw new Error("Integrity count query returned no row");
    return row;
  }, "readIntegrityCounts");
}
