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
  | "RATE_LIMITED"
  | "UPSTREAM_FAILURE";

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

export class PortError extends ServiceError {
  readonly port: string;
  readonly retryable: boolean;

  constructor(port: string, message: string, retryable = true, options?: ErrorOptions) {
    super("UPSTREAM_FAILURE", `${port}: ${message}`, options);
    this.port = port;
    this.retryable = retryable;
  }
}
