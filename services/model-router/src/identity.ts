/**
 * Caller identity.
 *
 * This Worker has no public hostname, so only a Worker holding a service binding
 * can reach it. That is not sufficient on its own: a service binding authorises
 * the *Worker*, not the *person*, and the model budget belongs to a school.
 *
 * Two things are therefore required on every request:
 *
 * 1. A bearer token, proving the caller is an EdApex Worker. `Authorization:
 *    Bearer` is used rather than a bespoke header because that is what every
 *    OpenAI client already sends, so the endpoint is exercisable with a standard
 *    SDK and no special-casing.
 * 2. The resolved caller identity, forwarded by `cowork-api` **after** it has
 *    validated the session cookie against `sms-api`. This Worker never parses a
 *    cookie and never talks to D1, so it cannot be tricked into authenticating
 *    someone by being handed a token it does not understand.
 */

export interface Caller {
  readonly userId: number;
  readonly schoolId: number | null;
  readonly role: string;
}

export interface IdentityFailure {
  readonly status: 401 | 403;
  readonly message: string;
}

const CALLER_USER_HEADER = "x-edapex-user-id";
const CALLER_SCHOOL_HEADER = "x-edapex-school-id";
const CALLER_ROLE_HEADER = "x-edapex-role";

/** Extract a bearer token, case-insensitively, as OpenAI clients send it. */
export function bearerToken(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

/** Constant-time comparison, so a wrong secret cannot be found by timing. */
const timingSafeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
};

/**
 * Validate the caller. Returns the identity, or a failure to answer with.
 *
 * `expectedSecret` comes from the Worker's own binding, not the request.
 */
export function resolveCaller(
  headers: Headers,
  expectedSecret: string | undefined
): Caller | IdentityFailure {
  if (expectedSecret === undefined || expectedSecret.length === 0) {
    // Fail closed: an unconfigured secret must not mean "no auth required".
    return { status: 401, message: "The model router is not configured." };
  }

  const presented = bearerToken(headers.get("authorization"));
  if (presented === null || !timingSafeEqual(presented, expectedSecret)) {
    return { status: 401, message: "Invalid API key." };
  }

  const rawUser = headers.get(CALLER_USER_HEADER);
  const userId = rawUser === null ? Number.NaN : Number(rawUser);
  if (!Number.isInteger(userId) || userId <= 0) {
    return { status: 401, message: "A caller identity is required." };
  }

  const rawSchool = headers.get(CALLER_SCHOOL_HEADER);
  const schoolId = rawSchool === null || rawSchool.length === 0 ? null : Number(rawSchool);
  if (schoolId !== null && (!Number.isInteger(schoolId) || schoolId <= 0)) {
    return { status: 401, message: "The tenant identity is invalid." };
  }

  const role = headers.get(CALLER_ROLE_HEADER) ?? "";
  return { userId, schoolId, role };
}

export function isIdentityFailure(value: Caller | IdentityFailure): value is IdentityFailure {
  return "status" in value;
}

/**
 * The headers `cowork-api` must send.
 *
 * The bearer token is passed separately because it is the Worker's secret, not
 * part of a person's identity. Exported so both sides cannot drift.
 */
export function callerHeaders(
  caller: Caller,
  secret: string
): Record<string, string> {
  return {
    authorization: `Bearer ${secret}`,
    [CALLER_USER_HEADER]: String(caller.userId),
    [CALLER_SCHOOL_HEADER]: caller.schoolId === null ? "" : String(caller.schoolId),
    [CALLER_ROLE_HEADER]: caller.role
  };
}
