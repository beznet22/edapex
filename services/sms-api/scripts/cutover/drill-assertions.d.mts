export class DrillError extends Error {}

export function expectStatus(
  response: { readonly status: number; readonly text: string },
  expected: number,
  label: string
): void;
export function expectTrue(value: unknown, message: string): asserts value;
export function normalizeCategory(name: string | null | undefined): string;
export function compareCounts(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
  ignored: ReadonlySet<string>
): { readonly changed: readonly string[]; readonly missing: readonly string[] };
export function assertCoreCountsUnchanged(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
  ignored: ReadonlySet<string>
): void;
export function pickCounts(
  counts: Readonly<Record<string, number>>,
  tables: readonly string[]
): Readonly<Record<string, number>>;
