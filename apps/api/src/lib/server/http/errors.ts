import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

import {
  DbEntityNotFoundError,
  DbError
} from "../repository/base/errors";
import {
  RateLimitError,
  ServiceError,
  ValidationError
} from "../services/errors";

export const TENANT_SCOPE_MESSAGE = "Pick a class and section to continue.";

const GENERIC_MESSAGE = "An unexpected error occurred";
const UPSTREAM_MESSAGE = "An upstream service failed";

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "TENANT_MISMATCH"
  | "NOT_FOUND"
  | "CONFLICT"
  | "AMBIGUOUS_EMAIL"
  | "LINK_EMAIL_MISMATCH"
  | "LINK_EMAIL_UNVERIFIED"
  | "PASSWORD_LOGIN_RETIRED"
  | "TENANT_SCOPE_REQUIRED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "UPSTREAM_FAILURE"
  | "SESSION_READ_ONLY"
  | "ARCHIVE_INCOMPLETE"
  | "ARCHIVE_VERSION_UNSUPPORTED"
  | "WIPE_APPROVAL_REQUIRED"
  | "JOB_STATE_INVALID";

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502;

export interface ErrorEnvelope {
  readonly error: ErrorCode;
  readonly message: string;
  readonly requestId: string;
}

export interface TenantScopeEnvelope {
  readonly error: "TENANT_SCOPE_REQUIRED";
  readonly message: string;
}

export type ErrorBody = ErrorEnvelope | TenantScopeEnvelope;

export interface ErrorMapping {
  readonly status: ErrorStatus;
  readonly body: ErrorBody;
  readonly retryAfterSeconds?: number;
}

const envelope = (
  status: ErrorStatus,
  error: ErrorCode,
  message: string,
  requestId: string
): ErrorMapping => ({
  status,
  body: { error, message, requestId }
});

const tenantEnvelope = (message: string): ErrorMapping => ({
  status: 422,
  body: { error: "TENANT_SCOPE_REQUIRED", message }
});

const isUniqueConstraint = (error: DbError): boolean => {
  const messages = [error.message];
  if (error.cause instanceof Error) messages.push(error.cause.message);
  return messages.some((message) =>
    /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(message)
  );
};

const fromServiceError = (error: ServiceError, requestId: string): ErrorMapping => {
  switch (error.code) {
    case "VALIDATION_FAILED": {
      const message =
        error instanceof ValidationError &&
        error.path.length > 0 &&
        !error.message.includes(error.path)
          ? `${error.path}: ${error.message}`
          : error.message;
      return envelope(400, "VALIDATION_FAILED", message, requestId);
    }
    case "UNAUTHENTICATED":
      return envelope(401, "UNAUTHENTICATED", error.message, requestId);
    case "FORBIDDEN":
      return envelope(403, "FORBIDDEN", error.message, requestId);
    case "TENANT_MISMATCH":
      return envelope(403, "TENANT_MISMATCH", error.message, requestId);
    case "TENANT_SCOPE_REQUIRED":
      return tenantEnvelope(error.message);
    case "AMBIGUOUS_EMAIL":
      return envelope(409, "AMBIGUOUS_EMAIL", error.message, requestId);
    case "CONFLICT":
      return envelope(409, "CONFLICT", error.message, requestId);
    case "LINK_EMAIL_MISMATCH":
      return envelope(403, "LINK_EMAIL_MISMATCH", error.message, requestId);
    case "LINK_EMAIL_UNVERIFIED":
      return envelope(403, "LINK_EMAIL_UNVERIFIED", error.message, requestId);
    case "PASSWORD_LOGIN_RETIRED":
      return envelope(403, "PASSWORD_LOGIN_RETIRED", error.message, requestId);
    case "RATE_LIMITED": {
      const retryAfterSeconds = error instanceof RateLimitError ? error.retryAfterSeconds : 60;
      return {
        ...envelope(429, "RATE_LIMITED", error.message, requestId),
        retryAfterSeconds
      };
    }
    case "UPSTREAM_FAILURE":
      return envelope(502, "UPSTREAM_FAILURE", UPSTREAM_MESSAGE, requestId);
    case "NOT_FOUND":
      return envelope(404, "NOT_FOUND", error.message, requestId);
    case "SESSION_READ_ONLY":
      return envelope(409, "SESSION_READ_ONLY", error.message, requestId);
    case "ARCHIVE_INCOMPLETE":
      return envelope(409, "ARCHIVE_INCOMPLETE", error.message, requestId);
    case "ARCHIVE_VERSION_UNSUPPORTED":
      return envelope(409, "ARCHIVE_VERSION_UNSUPPORTED", error.message, requestId);
    case "WIPE_APPROVAL_REQUIRED":
      return envelope(403, "WIPE_APPROVAL_REQUIRED", error.message, requestId);
    case "JOB_STATE_INVALID":
      return envelope(409, "JOB_STATE_INVALID", error.message, requestId);
  }
};

const fromHttpException = (error: HTTPException, requestId: string): ErrorMapping => {
  switch (error.status) {
    case 400:
      return envelope(400, "VALIDATION_FAILED", error.message, requestId);
    case 401:
      return envelope(401, "UNAUTHENTICATED", error.message, requestId);
    case 403:
      return envelope(403, "FORBIDDEN", error.message, requestId);
    case 404:
      return envelope(404, "NOT_FOUND", error.message, requestId);
    case 409:
      return envelope(409, "CONFLICT", error.message, requestId);
    case 422:
      return tenantEnvelope(error.message.length > 0 ? error.message : TENANT_SCOPE_MESSAGE);
    case 429:
      return {
        ...envelope(429, "RATE_LIMITED", error.message, requestId),
        retryAfterSeconds: 60
      };
    case 502:
      return envelope(502, "UPSTREAM_FAILURE", UPSTREAM_MESSAGE, requestId);
    default:
      return error.status >= 500
        ? envelope(500, "INTERNAL_ERROR", GENERIC_MESSAGE, requestId)
        : envelope(400, "VALIDATION_FAILED", error.message, requestId);
  }
};

const fromZodError = (error: ZodError, requestId: string): ErrorMapping => {
  const issue = error.issues[0];
  const path =
    issue === undefined || issue.path.length === 0
      ? "body"
      : issue.path.map(String).join(".");
  return envelope(
    400,
    "VALIDATION_FAILED",
    `${path}: ${issue?.message ?? "Invalid input"}`,
    requestId
  );
};

/** Maps every failure exactly once; handlers never build error JSON. */
export function mapError(error: unknown, requestId: string): ErrorMapping {
  if (error instanceof ServiceError) return fromServiceError(error, requestId);
  if (error instanceof DbEntityNotFoundError) {
    return envelope(404, "NOT_FOUND", error.message, requestId);
  }
  if (error instanceof DbError) {
    return isUniqueConstraint(error)
      ? envelope(409, "CONFLICT", "A record with these values already exists", requestId)
      : envelope(500, "INTERNAL_ERROR", GENERIC_MESSAGE, requestId);
  }
  if (error instanceof HTTPException) return fromHttpException(error, requestId);
  if (error instanceof ZodError) return fromZodError(error, requestId);
  return envelope(500, "INTERNAL_ERROR", GENERIC_MESSAGE, requestId);
}
