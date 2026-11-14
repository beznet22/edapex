import { DbEntityNotFoundError, DbError, DbInternalError } from "./errors";

/**
 * Wraps a data-access operation so driver failures never escape as raw errors.
 * Repository errors pass through unchanged; anything else becomes a
 * `DbInternalError` whose cause is logged but never returned to callers.
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DbError) throw error;
    console.error(`Repository operation failed: ${context}`, error);
    throw new DbInternalError(`Failed to ${context}`, { cause: error });
  }
}

/** Turns a single-row result into a value or a 404-shaped repository error. */
export function unwrapSingleQueryResult<T>(
  rows: readonly T[],
  entity: string,
  id: string | number
): T {
  const [row] = rows;
  if (row === undefined) throw new DbEntityNotFoundError(entity, id);
  return row;
}
