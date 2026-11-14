import { describe, expect, it } from "vitest";
import { z } from "zod";

import { mapError, TENANT_SCOPE_MESSAGE } from "../../src/lib/server/http/errors";
import type { ErrorMapping } from "../../src/lib/server/http/errors";
import {
  DbEntityNotFoundError,
  DbError,
  DbInternalError
} from "../../src/lib/server/repository/base/errors";
import {
  AuthError,
  NotFoundError,
  PermissionError,
  PortError,
  RateLimitError,
  TenantMismatchError,
  TenantScopeError,
  ValidationError
} from "../../src/lib/server/services/errors";

const REQUEST_ID = "req-42";

const expectEnvelope = (
  mapping: ErrorMapping,
  status: number,
  code: string
): void => {
  expect(mapping.status).toBe(status);
  expect(mapping.body.error).toBe(code);
  expect("requestId" in mapping.body ? mapping.body.requestId : null).toBe(REQUEST_ID);
  expect(mapping.body.message.length).toBeGreaterThan(0);
  expect(JSON.stringify(mapping.body)).not.toMatch(/SQL|sqlite|stack|gmail/i);
};

describe("error mapping", () => {
  it("maps validation failures with the field path", () => {
    const mapping = mapError(new ValidationError("A positive id is required", "studentId"), REQUEST_ID);
    expectEnvelope(mapping, 400, "VALIDATION_FAILED");
    expect(mapping.body.message).toContain("studentId");
  });

  it("maps zod failures with the first field path", () => {
    const parsed = z.object({ count: z.number() }).safeParse({ count: "nope" });
    if (parsed.success) throw new Error("fixture should fail");
    const mapping = mapError(parsed.error, REQUEST_ID);
    expectEnvelope(mapping, 400, "VALIDATION_FAILED");
    expect(mapping.body.message).toContain("count");
  });

  it("maps authentication and authorization failures", () => {
    expectEnvelope(mapError(new AuthError(), REQUEST_ID), 401, "UNAUTHENTICATED");
    expectEnvelope(mapError(new PermissionError(), REQUEST_ID), 403, "FORBIDDEN");
    expectEnvelope(
      mapError(new TenantMismatchError("Wrong school"), REQUEST_ID),
      403,
      "TENANT_MISMATCH"
    );
  });

  it("maps not-found from services and repositories", () => {
    expectEnvelope(mapError(new NotFoundError("Student", 42), REQUEST_ID), 404, "NOT_FOUND");
    expectEnvelope(
      mapError(new DbEntityNotFoundError("Student", 42), REQUEST_ID),
      404,
      "NOT_FOUND"
    );
  });

  it("maps a unique constraint to conflict", () => {
    const error = new DbError("DB_ERROR", "insert failed", {
      cause: new Error("D1_ERROR: UNIQUE constraint failed: sm_students.id")
    });
    expectEnvelope(mapError(error, REQUEST_ID), 409, "CONFLICT");
  });

  it("keeps the 422 body byte-identical and without a requestId", () => {
    const mapping = mapError(new TenantScopeError(TENANT_SCOPE_MESSAGE), REQUEST_ID);
    expect(mapping.status).toBe(422);
    expect(JSON.stringify(mapping.body)).toBe(
      '{"error":"TENANT_SCOPE_REQUIRED","message":"Pick a class and section to continue."}'
    );
    expect("requestId" in mapping.body).toBe(false);
  });

  it("maps rate limits with a retry hint", () => {
    const mapping = mapError(new RateLimitError(30), REQUEST_ID);
    expectEnvelope(mapping, 429, "RATE_LIMITED");
    expect(mapping.retryAfterSeconds).toBe(30);
  });

  it("hides database and upstream details behind generic messages", () => {
    const db = mapError(
      new DbInternalError("Failed to select", { cause: new Error("SQLITE_ERROR: no such table") }),
      REQUEST_ID
    );
    expectEnvelope(db, 500, "INTERNAL_ERROR");
    expect(db.body.message).toBe("An unexpected error occurred");

    const upstream = mapError(new PortError("email", "gmail 500"), REQUEST_ID);
    expectEnvelope(upstream, 502, "UPSTREAM_FAILURE");
    expect(upstream.body.message).toBe("An upstream service failed");
  });

  it("maps unknown errors to a generic 500", () => {
    const mapping = mapError(new Error("boom"), REQUEST_ID);
    expectEnvelope(mapping, 500, "INTERNAL_ERROR");
    expect(mapping.body.message).toBe("An unexpected error occurred");
  });
});
