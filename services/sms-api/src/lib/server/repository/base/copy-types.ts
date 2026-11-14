/** Shared source→target id maps for the bootstrap copy repositories. */
export interface CopyMaps {
  readonly classMap: ReadonlyMap<number, number>;
  readonly sectionMap: ReadonlyMap<number, number>;
  readonly subjectMap: ReadonlyMap<number, number>;
}

export interface SkippedStaffingRow {
  readonly sourceId: number;
  readonly teacherId: number | null;
  readonly reason: "TEACHER_MISSING" | "TEACHER_INACTIVE" | "TEACHER_USER_INACTIVE" | "MAPPING_MISSING";
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly subjectId: number | null;
}
