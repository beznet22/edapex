/**
 * Port-local term view (`05 §4.1`). The legacy `title`/`is_average`/
 * `percentage`/`average_mark` columns were replaced by `name`, `legacy_suffix`
 * and the `grading` JSON, so repositories project this shape and the service
 * layer owns display composition.
 */
export interface TermSummary {
  readonly id: number;
  readonly name: string;
  readonly sequence: number;
  readonly status: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly legacySuffix: string | null;
  readonly isAverage: boolean;
  readonly percentage: number | null;
  readonly averageMark: number | null;
}

export interface TermGrading {
  readonly isAverage: boolean;
  readonly percentage: number | null;
  readonly averageMark: number | null;
}

const EMPTY_GRADING: TermGrading = {
  isAverage: false,
  percentage: null,
  averageMark: null
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Malformed grading JSON degrades to nulls instead of failing the read. */
export function parseTermGrading(raw: string | null): TermGrading {
  if (raw === null || raw.trim().length === 0) return EMPTY_GRADING;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_GRADING;
  }
  if (!isRecord(parsed)) return EMPTY_GRADING;

  const averageFlag = parsed["isAverage"];
  return {
    isAverage: averageFlag === true || averageFlag === 1,
    percentage: typeof parsed["percentage"] === "number" ? parsed["percentage"] : null,
    averageMark: typeof parsed["averageMark"] === "number" ? parsed["averageMark"] : null
  };
}
