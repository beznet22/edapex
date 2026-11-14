export interface TransformedTable {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
}

export interface TimelineExport {
  readonly academicId: number;
  readonly rows: number;
  readonly ndjson: string;
  readonly key: string;
}

export interface PhotoReference {
  readonly url: string;
  readonly file: string;
  readonly extension: string;
  readonly kind: string;
  readonly studentIds: readonly number[];
  readonly references: number;
}

export interface TransformResult {
  readonly tables: Map<string, TransformedTable>;
  readonly resolutions: readonly Record<string, unknown>[];
  readonly findings: Readonly<Record<string, number>>;
  readonly stats: Readonly<Record<string, number>>;
  readonly removedParents: readonly unknown[];
  readonly deactivatedUsers: readonly unknown[];
  readonly timelines: { readonly exports: readonly TimelineExport[] };
  readonly photos: readonly PhotoReference[];
  readonly sourceRows: Readonly<Record<string, number>>;
  readonly outputRows: Readonly<Record<string, number>>;
}

export function transformDump(
  dump: unknown,
  options: Readonly<Record<string, unknown>>
): TransformResult;
