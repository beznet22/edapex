import type { smMarkStores, smResultStores } from "../../db/schema";

export type MarkRow = typeof smMarkStores.$inferSelect;
export type NewMark = typeof smMarkStores.$inferInsert;
export type ResultRow = typeof smResultStores.$inferSelect;
export type NewResult = typeof smResultStores.$inferInsert;

export interface MarkWithSetup {
  readonly studentId: number | null;
  readonly markId: number;
  readonly subjectId: number | null;
  readonly totalMarks: number;
  readonly examTitle: string | null;
  readonly examMark: number | null;
  readonly subjectCode: string | null;
  readonly isAbsent: number;
  readonly subjectName: string | null;
}

export interface ResultRecordRow {
  readonly studentId: number | null;
  readonly resultId: number;
  readonly subjectId: number | null;
  readonly subjectName: string | null;
  readonly subjectCode: string | null;
  readonly teacherRemarks: string | null;
}

export interface ClassResultRow {
  readonly studentId: number | null;
  readonly resultId: number;
  readonly subjectId: number | null;
  readonly totalMarks: number;
  readonly totalGpaGrade: string | null;
  readonly examTypeId: number | null;
}

export interface ClassAverageRow {
  readonly studentId: number | null;
  readonly average: number | null;
}
