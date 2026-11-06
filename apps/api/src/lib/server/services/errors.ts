/**
 * Domain error taxonomy (`02 §7`). Repositories raise `Db*`; services translate
 * those and raise the rest. HTTP maps both exactly once in Phase 4.
 */

export type ServiceErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "TENANT_MISMATCH"
  | "TENANT_SCOPE_REQUIRED"
  | "AMBIGUOUS_EMAIL"
  | "CONFLICT"
  | "LINK_EMAIL_MISMATCH"
  | "LINK_EMAIL_UNVERIFIED"
  | "PASSWORD_LOGIN_RETIRED"
  | "RATE_LIMITED"
  | "UPSTREAM_FAILURE"
  | "NOT_FOUND"
  | "SESSION_READ_ONLY"
  | "ARCHIVE_INCOMPLETE"
  | "WIPE_APPROVAL_REQUIRED"
  | "JOB_STATE_INVALID";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ValidationError extends ServiceError {
  readonly path: string;
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, path = "", issues: readonly ValidationIssue[] = []) {
    super("VALIDATION_FAILED", message);
    this.path = path;
    this.issues = issues;
  }
}

export class AuthError extends ServiceError {
  constructor(message = "Authentication required") {
    super("UNAUTHENTICATED", message);
  }
}

export class PermissionError extends ServiceError {
  constructor(message = "You do not have permission to perform this action") {
    super("FORBIDDEN", message);
  }
}

export class WorkspaceMismatchError extends ServiceError {
  readonly classId: number;
  readonly sectionId: number;

  constructor(classId: number, sectionId: number, message?: string) {
    super(
      "TENANT_MISMATCH",
      message ?? `Teacher is not assigned to class ${classId}/section ${sectionId}`
    );
    this.classId = classId;
    this.sectionId = sectionId;
  }
}

export class TenantScopeError extends ServiceError {
  constructor(message = "A tenant context is required for this operation") {
    super("TENANT_SCOPE_REQUIRED", message);
  }
}

export class TenantMismatchError extends ServiceError {
  constructor(message = "The requested scope does not belong to this school") {
    super("TENANT_MISMATCH", message);
  }
}

export class NotFoundError extends ServiceError {
  readonly entity: string;
  readonly entityId: string | number;

  constructor(entity: string, entityId: string | number) {
    super("NOT_FOUND", `${entity} '${entityId}' not found`);
    this.entity = entity;
    this.entityId = entityId;
  }
}

export class AmbiguousEmailError extends ServiceError {
  readonly email: string;

  constructor(email: string) {
    super("AMBIGUOUS_EMAIL", `More than one account uses the verified email '${email}'`);
    this.email = email;
  }
}

export class RateLimitError extends ServiceError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message?: string) {
    super("RATE_LIMITED", message ?? `Too many attempts; retry in ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}

export class LinkEmailMismatchError extends ServiceError {
  constructor() {
    super(
      "LINK_EMAIL_MISMATCH",
      "The Google account's verified email does not match this account; contact an administrator"
    );
  }
}

export class LinkEmailUnverifiedError extends ServiceError {
  constructor() {
    super("LINK_EMAIL_UNVERIFIED", "The Google account's email address is not verified");
  }
}

export class PasswordLoginRetiredError extends ServiceError {
  constructor() {
    super(
      "PASSWORD_LOGIN_RETIRED",
      "Password sign-in is retired; claim your account with the school-issued password"
    );
  }
}

export class PortError extends ServiceError {
  readonly port: string;
  readonly retryable: boolean;

  constructor(port: string, message: string, retryable = true, options?: ErrorOptions) {
    super("UPSTREAM_FAILURE", `${port}: ${message}`, options);
    this.port = port;
    this.retryable = retryable;
  }
}

export class SessionReadOnlyError extends ServiceError {
  constructor(message = "This session is read-only") {
    super("SESSION_READ_ONLY", message);
  }
}

export class ArchiveIncompleteError extends ServiceError {
  readonly gaps: readonly string[];

  constructor(message: string, gaps: readonly string[] = []) {
    super("ARCHIVE_INCOMPLETE", message);
    this.gaps = gaps;
  }
}

export class WipeApprovalError extends ServiceError {
  constructor(message = "A second administrator's approval is required") {
    super("WIPE_APPROVAL_REQUIRED", message);
  }
}

export class JobStateError extends ServiceError {
  constructor(message: string) {
    super("JOB_STATE_INVALID", message);
  }
}
