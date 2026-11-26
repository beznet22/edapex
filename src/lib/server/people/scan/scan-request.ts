import { getDatabase } from "$lib/server/db";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { canAccessPeople, isAdminOrIt } from "$lib/server/people/people-access";
import type { AuthUser } from "$lib/types/auth-types";

/**
 * Shared request context for the marks endpoints. Authorisation is resolved once here so no
 * route can accidentally skip it, and every route is CSRF-checked before this runs.
 */

export interface ScanRequestContext {
  user: AuthUser;
  staffId: number;
  schoolId: number;
  academicId: number;
  isManager: boolean;
  allowedClassSections: { classId: number; sectionId: number }[];
}

export class ScanRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ScanRequestError";
  }
}

/**
 * Same-origin check for state-changing requests. Browsers send `Origin` on cross-origin POSTs,
 * so a missing or foreign origin is rejected; this is the app's established CSRF posture.
 */
export const assertSameOrigin = (request: Request, expectedOrigin: string): void => {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new ScanRequestError("Missing Origin header", 403);
  }
  if (origin !== expectedOrigin) {
    throw new ScanRequestError("Cross-origin request refused", 403);
  }
};

export async function resolveScanRequest(input: {
  user: AuthUser | null | undefined;
  url: URL;
  requireManager?: boolean;
}): Promise<ScanRequestContext> {
  const { user } = input;
  if (!user || !canAccessPeople(user)) {
    throw new ScanRequestError("You do not have access to marks scanning", 403);
  }

  const isManager = isAdminOrIt(user);
  if (input.requireManager && !isManager) {
    throw new ScanRequestError("Only admins and IT staff can do this", 403);
  }

  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(
    db,
    createTenantContext({
      schoolId: user.schoolId ?? 1,
      userId: user.id,
      staffId: user.staffId ?? undefined,
    })
  );
  const results = provider.getRepo(ResultsRepository);

  const activeYear = await results.getActiveAcademicYear();
  if (!activeYear) {
    throw new ScanRequestError("No active academic year", 400);
  }

  const allowedClassSections = isManager
    ? []
    : await results.getAssignedClassSections({
        staffId: user.staffId ?? 0,
        schoolId: user.schoolId ?? 1,
        academicId: activeYear.id,
      });

  return {
    user,
    staffId: user.staffId ?? 0,
    schoolId: user.schoolId ?? 1,
    academicId: activeYear.id,
    isManager,
    allowedClassSections,
  };
}

/** Maps every scan error shape onto a JSON envelope; never leaks a stack or an image. */
export const toErrorResponse = (cause: unknown): Response => {
  if (cause instanceof ScanRequestError) {
    return Response.json({ error: cause.message }, { status: cause.status });
  }
  const message = cause instanceof Error ? cause.message : "Unexpected scan error";
  return Response.json({ error: message }, { status: 500 });
};

export const requireParam = (value: string | null, name: string): string => {
  if (!value || value.trim() === "") {
    throw new ScanRequestError(`Missing ${name}`, 400);
  }
  return value;
};

export const requireNumber = (value: string | null, name: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ScanRequestError(`Invalid ${name}`, 400);
  }
  return parsed;
};

/** Converts a plain thrown error into a SvelteKit 500 so route bodies stay linear. */
export const guard = async (run: () => Promise<Response>): Promise<Response> => {
  try {
    return await run();
  } catch (cause) {
    return toErrorResponse(cause);
  }
};
