/**
 * Deterministic exam-term resolution for a child.
 *
 * Looks at every exam term (`sm_exam_types`) that has at least one
 * `sm_result_stores` row for the child, in the active `schoolId`. The
 * caller passes optional `termHint` (a title or numeric id) and
 * `yearHint` (an academic year title or numeric id) to narrow the
 * result.
 *
 * Disambiguation is layered:
 *   - Single matching examType  → `exact`
 *   - Multiple examTypes with the same title across different academic
 *     years  → `ambiguous_years` (caller shows year picker)
 *   - Multiple distinct terms (no overlap on title) for the student
 *     → `ambiguous_terms` (caller shows term picker)
 *   - No match → `not_found`
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { MySQLDrizzleClient } from "$lib/server/db";
import { smAcademicYears, smExamTypes, smResultStores } from "$lib/server/db/sms-schema";

export type DrizzleExecutor = MySQLDrizzleClient;

export interface ExamTypeRow {
  examTypeId: number;
  title: string;
  academicId: number;
  academicYear: string;
  academicTitle: string;
}

export type TermResolution =
  | { kind: "exact"; examType: ExamTypeRow }
  | { kind: "ambiguous_terms"; examTypes: ExamTypeRow[] }
  | { kind: "ambiguous_years"; examTypes: ExamTypeRow[]; termTitle: string }
  | { kind: "not_found" };

export interface ResolveTermInput {
  db: DrizzleExecutor;
  schoolId: number;
  studentId: number;
  termHint: string | null;
  yearHint: string | null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function matchByHint(
  rows: ExamTypeRow[],
  termHint: string | null,
  yearHint: string | null,
): ExamTypeRow[] {
  let out = rows;
  if (termHint) {
    if (isNumeric(termHint)) {
      const id = Number(termHint);
      out = out.filter((r) => r.examTypeId === id);
    } else {
      const n = normalize(termHint);
      out = out.filter((r) => normalize(r.title) === n);
    }
  }
  if (yearHint) {
    if (isNumeric(yearHint)) {
      const id = Number(yearHint);
      out = out.filter((r) => r.academicId === id);
    } else {
      const n = normalize(yearHint);
      out = out.filter(
        (r) => normalize(r.academicYear) === n || normalize(r.academicTitle) === n,
      );
    }
  }
  return out;
}

export async function resolveTerm(input: ResolveTermInput): Promise<TermResolution> {
  const { db, schoolId, studentId, termHint, yearHint } = input;

  // First find every examType that has at least one result row for this child.
  const presentTypeIds = await db
    .selectDistinct({ examTypeId: smResultStores.examTypeId })
    .from(smResultStores)
    .where(
      and(
        eq(smResultStores.studentId, studentId),
        eq(smResultStores.schoolId, schoolId),
        eq(smResultStores.activeStatus, 1),
      ),
    );

  const ids = presentTypeIds
    .map((r) => r.examTypeId)
    .filter((id): id is number => id !== null);
  if (ids.length === 0) {
    return { kind: "not_found" };
  }

  const examTypeRows = await db
    .select({
      examTypeId: smExamTypes.id,
      title: smExamTypes.title,
      academicId: smExamTypes.academicId,
      academicYear: smAcademicYears.year,
      academicTitle: smAcademicYears.title,
    })
    .from(smExamTypes)
    .leftJoin(smAcademicYears, eq(smExamTypes.academicId, smAcademicYears.id))
    .where(
      and(
        inArray(smExamTypes.id, ids),
        eq(smExamTypes.schoolId, schoolId),
        eq(smExamTypes.activeStatus, sql`1`),
      ),
    )
    .orderBy(desc(smExamTypes.id));

  const examTypes: ExamTypeRow[] = examTypeRows.flatMap((r) => {
    if (
      typeof r.examTypeId === "number" &&
      typeof r.title === "string" &&
      typeof r.academicId === "number" &&
      typeof r.academicYear === "string" &&
      typeof r.academicTitle === "string"
    ) {
      return [
        {
          examTypeId: r.examTypeId,
          title: r.title,
          academicId: r.academicId,
          academicYear: r.academicYear,
          academicTitle: r.academicTitle,
        },
      ];
    }
    return [];
  });

  if (examTypes.length === 0) {
    return { kind: "not_found" };
  }

  // No hints at all → prefer the most recent (highest examTypeId).
  if (!termHint && !yearHint) {
    const latest = examTypes[0];
    if (latest) {
      return { kind: "exact", examType: latest };
    }
    return { kind: "not_found" };
  }

  const filtered = matchByHint(examTypes, termHint, yearHint);
  if (filtered.length === 0) {
    return { kind: "not_found" };
  }
  if (filtered.length === 1) {
    const only = filtered[0];
    if (only) {
      return { kind: "exact", examType: only };
    }
    return { kind: "not_found" };
  }

  // Multiple matches. If all rows share the same term title, the
  // disambiguation is across academic years. Otherwise, the parent
  // typed a partial hint that matched several distinct terms.
  const titles = new Set(filtered.map((r) => normalize(r.title)));
  if (titles.size === 1) {
    const firstTitle = filtered[0]?.title ?? "";
    return { kind: "ambiguous_years", examTypes: filtered, termTitle: firstTitle };
  }
  return { kind: "ambiguous_terms", examTypes: filtered };
}
