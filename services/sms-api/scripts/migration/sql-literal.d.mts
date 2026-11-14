export function sqlLiteral(value: unknown): string;
export function sqlIdentifier(name: string): string;
export function chunk<T>(items: readonly T[], size: number): T[][];
export function insertStatement(
  table: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[]
): string | null;
export function insertStatements(
  table: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  rowsPerStatement?: number
): string[];
