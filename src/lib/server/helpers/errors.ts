/**
 * Custom error classes for database operations
 */

export interface DbErrorOptions {
  cause?: unknown;
  message?: string;
}

/**
 * Base class for all database errors
 */
export class DbError extends Error {
  constructor(message: string, options?: DbErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown when an entity is not found in the database
 */
export class DbEntityNotFoundError extends DbError {
  constructor(entityType: string, id: string) {
    super(`${entityType} with id '${id}' not found`);
  }
}

/**
 * Error thrown when a database operation fails due to internal error
 */
export class DbInternalError extends DbError {
  constructor(options?: DbErrorOptions) {
    super(options?.message ?? "An internal database error occurred", options);
  }
}

/**
 * Unwraps a single query result from an array.
 * Throws DbEntityNotFoundError if the array is empty.
 */
export function unwrapSingleQueryResult<T>(rows: T[], id: string, entityType: string): T {
  if (rows.length === 0) {
    throw new DbEntityNotFoundError(entityType, id);
  }
  return rows[0];
}
