/**
 * Document render contracts.
 *
 * `sms-api` returns a *data document* from the archive render endpoints; the client
 * turns it into a PDF with IronPress. That makes this payload a wire contract between
 * two packages, so it lives here rather than in the server's DTO file where nothing
 * could check the client against it.
 *
 * The authoritative document shape is the zod schema in `services/sms-api` — it carries
 * refinements a hand-written type would duplicate and then drift from. This file
 * declares the slice a renderer needs, and
 * `services/sms-api/tests/documents-contract.test.ts` asserts the schema still satisfies
 * it, so a field rename breaks the build instead of quietly rendering a blank cell.
 */

/**
 * The templates we can render.
 *
 * A type rather than a runtime `const [...] as const` array: this module is imported by
 * client components for its types alone, and a runtime array would be emitted into the
 * initial bundle for every one of them. It measured at +393 B of gzip against a 60 KB
 * controllable budget — small, but it is pure waste and the budget is deliberately tight.
 */
export type TemplateVersion = "marksheet@1" | "transcript@1" | "transcript-history@1";

/**
 * Mirrors `CATEGORY_VALUES` in `services/sms-api/src/lib/constants/assessment.ts`.
 *
 * A narrow union rather than `string` because the category selects both the grade bands
 * and the mark columns: a bad value would render a card listing the wrong subjects
 * rather than failing loudly.
 *
 * Written as a type, not a `const` array, for the same bundle reason as
 * `TemplateVersion` above.
 */
export type StudentCategory =
  | "DAYCARE"
  | "NURSERY"
  | "GRADEK"
  | "LOWERBASIC"
  | "MIDDLEBASIC"
  | "UPPERBASIC";

export interface SchoolIdentity {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly logo?: string | undefined;
  readonly city: string;
  readonly state: string;
  readonly title: string;
  readonly vacation_date: string;
}

export interface StudentIdentity {
  readonly id: number;
  readonly examTypeId: number;
  readonly fullName: string;
  readonly gender: string;
  readonly parentEmail: string;
  readonly parentName: string;
  readonly term: string;
  readonly title: string;
  readonly category: StudentCategory;
  readonly className: string;
  readonly sectionName: string;
  readonly adminNo: number;
  readonly sessionYear: string;
  readonly daysOpened: number;
  readonly daysAbsent: number;
  readonly daysPresent: number;
  readonly studentPhoto?: string | undefined;
  readonly token: string;
}

export interface SubjectRecord {
  readonly studentId: number;
  readonly resultId: number;
  readonly subjectId: number;
  readonly subject: string;
  readonly subjectCode: string;
  readonly objectives: readonly string[] | null;
  readonly titles: readonly string[];
  readonly marks: readonly number[];
  readonly fullMarks: readonly number[];
  readonly totalScore?: number | undefined;
  readonly grade: string;
  readonly color?: string | undefined;
  /**
   * Per-mark absence. `true` renders ABS and is excluded from the average — a zero
   * would drag the term average down and misreport a child who was simply away.
   */
  readonly absent?: readonly boolean[] | undefined;
  readonly category: StudentCategory;
  readonly learningOutcome?: string | null | undefined;
}

export interface ScoreSummary {
  readonly total: number;
  readonly average: number;
  readonly maxScores: number;
  readonly classAverage: {
    readonly min: { readonly studentId?: number | undefined; readonly value: string };
    readonly max: { readonly studentId?: number | undefined; readonly value: string };
  };
}

export interface RatingEntry {
  readonly attribute: string | null;
  readonly rate: number | null;
  readonly remark: string | null;
  readonly color: string | null;
}

export interface MarksheetDocument {
  readonly school: SchoolIdentity;
  readonly student: StudentIdentity;
  readonly subjects: readonly {
    readonly subjectId: number | null;
    readonly subjectCode: string | null;
  }[];
  readonly records: readonly SubjectRecord[];
  readonly score?: ScoreSummary | undefined;
  readonly ratings: readonly RatingEntry[];
  readonly remark?: { readonly remark: string | null } | undefined;
  readonly examType?:
    | { readonly id: number; readonly title?: string | undefined }
    | undefined;
  readonly recordId?: number | null | undefined;
}

export interface TranscriptTerm {
  readonly examTypeId: number;
  readonly title: string;
  readonly isAverage: boolean;
}

export interface TranscriptSubjectRow {
  readonly subjectId: number;
  readonly subject: string;
  readonly subjectCode: string;
  /** One entry per term, in `terms` order. Null means no paper that term. */
  readonly marks: readonly (number | null)[];
  readonly total: number;
  readonly percentage: number;
  readonly grade: string;
  readonly color?: string | undefined;
}

export interface TranscriptDocument {
  readonly school: SchoolIdentity;
  readonly student: StudentIdentity;
  readonly academicYear: { readonly id: number; readonly title: string; readonly year: string };
  readonly terms: readonly TranscriptTerm[];
  readonly subjects: readonly TranscriptSubjectRow[];
  readonly classAverage: number;
  readonly studentAverage: number;
  readonly yearlyTotal: number;
  readonly yearlyAverage: number;
  readonly maxPossibleTotal: number;
}

export interface SessionHistoryTerm {
  readonly termId: number;
  readonly sequence: number;
  readonly total: number | null;
  readonly average: number | null;
  readonly grade: string | null;
  readonly gpa: number | null;
  readonly position: number | null;
  readonly subjectCount: number | null;
}

export interface TranscriptHistoryDocument {
  readonly studentId: number;
  readonly sessions: readonly {
    readonly sessionId: number;
    readonly label: string;
    readonly terms: readonly SessionHistoryTerm[];
    readonly archive: {
      readonly objectKey: string;
      readonly checksum: string;
      readonly version: number;
      readonly status: string;
    } | null;
  }[];
}

/**
 * Envelope shared by every payload.
 *
 * `TVersion` is a type parameter rather than the whole `TemplateVersion` union so the
 * payloads form a real discriminated union. With the union in the field, TypeScript
 * cannot narrow on `templateVersion` and an exhaustive switch loses its guarantee —
 * which is exactly how a history document gets rendered as a transcript.
 */
export interface RenderPayloadBase<TDocument, TVersion extends TemplateVersion> {
  readonly templateVersion: TVersion;
  readonly version: number;
  readonly publishedAt: number | null;
  readonly filename: string;
  readonly document: TDocument;
}

export type MarksheetPayload = RenderPayloadBase<MarksheetDocument, "marksheet@1">;
export type TranscriptPayload = RenderPayloadBase<TranscriptDocument, "transcript@1">;
export type TranscriptHistoryPayload = RenderPayloadBase<
  TranscriptHistoryDocument,
  "transcript-history@1"
>;

export type RenderPayload =
  | MarksheetPayload
  | TranscriptPayload
  | TranscriptHistoryPayload;
