/**
 * Repository error taxonomy (`01 §7`). Only data access raises these; services
 * raise domain errors and the HTTP layer maps everything exactly once.
 */

export type DbErrorCode = "DB_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR";

export class DbError extends Error {
  readonly code: DbErrorCode;

  constructor(code: DbErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DbError";
    this.code = code;
  }
}

export class DbEntityNotFoundError extends DbError {
  readonly entity: string;
  readonly entityId: string | number;

  constructor(entity: string, id: string | number) {
    super("NOT_FOUND", `${entity} with id '${id}' not found`);
    this.name = "DbEntityNotFoundError";
    this.entity = entity;
    this.entityId = id;
  }
}

export class DbInternalError extends DbError {
  constructor(message: string, options?: ErrorOptions) {
    super("INTERNAL_ERROR", message, options);
    this.name = "DbInternalError";
  }
}
