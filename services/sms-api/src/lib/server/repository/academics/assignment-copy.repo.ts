import { and, eq } from "drizzle-orm";

import { smAssignSubjects } from "../../db/schema";
import { batchOrThrow, chunkedInsert } from "../base/d1-helpers";
import type { CopyMaps, SkippedStaffingRow } from "../base/copy-types";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

interface SourceAssignmentRow {
  readonly id: number;
  readonly teacherId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly subjectId: number | null;
  readonly staffActive: number | null;
  readonly userActive: number | null;
}

export interface SubjectAssignmentCopyInput extends CopyMaps {
  readonly sourceAcademicId: number;
  readonly targetAcademicId: number;
  readonly actorId: number;
}

export interface CopySubjectAssignmentsResult {
  readonly copied: number;
  readonly skipped: readonly SkippedStaffingRow[];
  readonly copiedSections: ReadonlySet<string>;
  readonly expectedSubjects: ReadonlyMap<string, readonly number[]>;
  readonly sourceCount: number;
}

const now = () => Math.floor(Date.now() / 1000);

function mapOrNull(
  map: ReadonlyMap<number, number>,
  id: number | null
): number | null {
  if (id === null) return null;
  return map.get(id) ?? null;
}

export async function copySubjectAssignments(
  ctx: ScopedRepositoryContext,
  input: SubjectAssignmentCopyInput,
  source: readonly SourceAssignmentRow[]
): Promise<CopySubjectAssignmentsResult> {
  return withErrorHandling(async () => {
    const existing = await ctx.db
      .select({
        classId: smAssignSubjects.classId,
        sectionId: smAssignSubjects.sectionId,
        subjectId: smAssignSubjects.subjectId,
        teacherId: smAssignSubjects.teacherId
      })
      .from(smAssignSubjects)
      .where(
        and(
          eq(smAssignSubjects.schoolId, ctx.tenant.schoolId),
          eq(smAssignSubjects.academicId, input.targetAcademicId),
          eq(smAssignSubjects.activeStatus, 1)
        )
      );
    const existingKeys = new Set(
      existing.map(
        (row) => `${row.classId}:${row.sectionId}:${row.subjectId}:${row.teacherId}`
      )
    );

    const skipped: SkippedStaffingRow[] = [];
    const rows = [];
    const copiedSections = new Set<string>();
    const expected = new Map<string, Set<number>>();

    for (const row of source) {
      const classId = mapOrNull(input.classMap, row.classId);
      const sectionId = mapOrNull(input.sectionMap, row.sectionId);
      const subjectId = mapOrNull(input.subjectMap, row.subjectId);
      if (classId === null || sectionId === null || subjectId === null) {
        skipped.push({
          sourceId: row.id,
          teacherId: row.teacherId,
          reason: "MAPPING_MISSING",
          classId,
          sectionId,
          subjectId
        });
        continue;
      }
      const sectionKey = `${classId}:${sectionId}`;
      const set = expected.get(sectionKey) ?? new Set<number>();
      set.add(subjectId);
      expected.set(sectionKey, set);

      if (row.teacherId === null || row.staffActive === null) {
        skipped.push({
          sourceId: row.id,
          teacherId: row.teacherId,
          reason: "TEACHER_MISSING",
          classId,
          sectionId,
          subjectId
        });
        continue;
      }
      if (row.staffActive !== 1) {
        skipped.push({
          sourceId: row.id,
          teacherId: row.teacherId,
          reason: "TEACHER_INACTIVE",
          classId,
          sectionId,
          subjectId
        });
        continue;
      }
      if (row.userActive !== 1) {
        skipped.push({
          sourceId: row.id,
          teacherId: row.teacherId,
          reason: "TEACHER_USER_INACTIVE",
          classId,
          sectionId,
          subjectId
        });
        continue;
      }
      const key = `${classId}:${sectionId}:${subjectId}:${row.teacherId}`;
      if (existingKeys.has(key)) {
        copiedSections.add(sectionKey);
        continue;
      }
      existingKeys.add(key);
      rows.push({
        activeStatus: 1,
        teacherId: row.teacherId,
        classId,
        sectionId,
        subjectId,
        schoolId: ctx.tenant.schoolId,
        academicId: input.targetAcademicId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now(),
        updatedAt: now()
      });
      copiedSections.add(sectionKey);
    }

    for (let index = 0; index < rows.length; index += 90) {
      const statements = chunkedInsert(ctx.db, smAssignSubjects, rows.slice(index, index + 90), 1);
      if (statements.length > 0) await batchOrThrow(ctx.db, statements);
    }

    return {
      copied: rows.length,
      skipped,
      copiedSections,
      expectedSubjects: new Map([...expected].map(([key, value]) => [key, [...value]])),
      sourceCount: source.length
    };
  }, "copySubjectAssignments");
}
