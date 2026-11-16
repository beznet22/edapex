import { apiBase } from "@edapex/host/api";
import { apiFetch, readMessage } from "@edapex/host/api/transport";

/**
 * The admin dashboard's data layer.
 *
 * Every call carries `X-Academic-Id`, like the rest of the admin surface — the tenant
 * middleware rejects a request without it, and the header is how a caller states which
 * academic year they are looking at.
 */

const headers = (academicId: number): Readonly<Record<string, string>> => ({
  "X-Academic-Id": String(academicId)
});

const call = async <T>(
  academicId: number,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> => {
  const response = await apiFetch(path, apiBase(), {
    ...(init.method === undefined ? {} : { method: init.method }),
    ...(init.body === undefined ? {} : { body: init.body }),
    headers: headers(academicId)
  });
  if (!response.ok) {
    throw new Error(readMessage(response.data, `Request failed (${response.status})`));
  }
  return response.data as T;
};

/* ── Staff ──────────────────────────────────────────────────────────────── */

export interface StaffRow {
  readonly id: number;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly designation: string | null;
  readonly department: string | null;
  readonly active: boolean;
  readonly staffPhoto: string | null;
  readonly hasAccount: boolean;
}

export interface StaffPage {
  readonly rows: readonly StaffRow[];
  readonly nextCursor: string | null;
  /** Total matching rows, for "page 3 of 12". */
  readonly total: number;
}

export interface StaffInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly designationId: number | null;
  readonly departmentId: number | null;
  readonly qualification: string | null;
  readonly experience: string | null;
  readonly dateOfBirth: string | null;
  readonly genderId: number | null;
  readonly roleId: number | null;
}

export const listStaff = async (
  academicId: number,
  filters: {
    readonly query?: string;
    readonly cursor?: string;
    readonly includeInactive?: boolean;
    readonly limit?: number;
  } = {}
): Promise<StaffPage> => {
  const params = new URLSearchParams();
  if (filters.query !== undefined && filters.query.length > 0) params.set("q", filters.query);
  if (filters.cursor !== undefined) params.set("cursor", filters.cursor);
  if (filters.includeInactive === true) params.set("includeInactive", "true");
  params.set("limit", String(filters.limit ?? 25));
  return await call<StaffPage>(academicId, `/api/v1/admin/staff?${params.toString()}`);
};

export const createStaff = async (academicId: number, input: StaffInput): Promise<StaffRow> =>
  await call<StaffRow>(academicId, "/api/v1/admin/staff", { method: "POST", body: input });

export const updateStaff = async (
  academicId: number,
  staffId: number,
  patch: Partial<StaffInput>
): Promise<StaffRow> =>
  await call<StaffRow>(academicId, `/api/v1/admin/staff/${staffId}`, {
    method: "PATCH",
    body: patch
  });

/** What the UI calls "Remove". Sets `active_status`, never deletes. */
export const setStaffActive = async (
  academicId: number,
  staffId: number,
  active: boolean
): Promise<StaffRow> =>
  await call<StaffRow>(academicId, `/api/v1/admin/staff/${staffId}/status`, {
    method: "PATCH",
    body: { active }
  });

/* ── Students ───────────────────────────────────────────────────────────── */

export interface GuardianView {
  readonly parentId: number;
  readonly name: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly hasAccount: boolean;
}

export interface StudentDetail {
  readonly studentId: number;
  readonly admissionNo: number | null;
  readonly fullName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly studentPhoto: string | null;
  readonly dateOfBirth: string | null;
  readonly genderId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly active: boolean;
  readonly guardian: GuardianView | null;
}

export const getStudent = async (
  academicId: number,
  studentId: number
): Promise<StudentDetail> =>
  await call<StudentDetail>(academicId, `/api/v1/students/${studentId}`);

export const updateStudent = async (
  academicId: number,
  studentId: number,
  patch: {
    readonly fullName?: string;
    readonly email?: string | null;
    readonly mobile?: string | null;
    readonly rollNo?: number | null;
  }
): Promise<StudentDetail> =>
  await call<StudentDetail>(academicId, `/api/v1/students/${studentId}`, {
    method: "PATCH",
    body: patch
  });

export const attachGuardian = async (
  academicId: number,
  studentId: number,
  input: {
    readonly parentId?: number;
    readonly name?: string;
    readonly email?: string | null;
    readonly mobile?: string | null;
    readonly relation?: string | null;
  }
): Promise<GuardianView> =>
  await call<GuardianView>(academicId, `/api/v1/students/${studentId}/guardian`, {
    method: "PUT",
    body: input
  });

export const detachGuardian = async (academicId: number, studentId: number): Promise<void> => {
  await call<null>(academicId, `/api/v1/students/${studentId}/guardian`, { method: "DELETE" });
};

/* ── Photos ─────────────────────────────────────────────────────────────── */

/**
 * Uploads a photo for a staff member or a student.
 *
 * Multipart, so this cannot go through `apiFetch`'s JSON path. On a native host the proxy
 * needs a second stack for binary bodies (§5 of the plan); until that exists this throws a
 * clear error rather than silently failing.
 */
export const uploadPhoto = async (
  path: string,
  file: File
): Promise<{ readonly photoUrl: string }> => {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${apiBase()}${path}`, {
    method: "PUT",
    credentials: "include",
    body
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new Error(readMessage(payload, `Upload failed (${response.status})`));
  }
  return (await response.json()) as { photoUrl: string };
};

/* ── Claim links ────────────────────────────────────────────────────────── */

export type Persona = "staff" | "parent";
export type LinkStatus = "none" | "active" | "expired" | "used" | "revoked";

/**
 * One row of the claim directory.
 *
 * Every field is carried because the old page used all of them: the Google, Duplicate and
 * non-Gmail badges, the link state and its expiry, and the claim status. Dropping any of them
 * is how the previous port lost nine features.
 */
export interface DirectoryItem {
  readonly persona: Persona;
  readonly subjectType: Persona;
  readonly subjectId: number;
  readonly recordId: number;
  readonly userId: number | null;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly claimStatus: "pending" | "claimed" | "flagged" | null;
  readonly userActive: number | null;
  readonly emailVerifiedAt: number | null;
  readonly linkedGoogle: boolean;
  readonly isGmail: boolean;
  readonly duplicateEmail: boolean;
  readonly linkStatus: LinkStatus;
  readonly linkId: string | null;
  readonly linkExpiresAt: number | null;
}

export interface DirectoryPage {
  readonly items: readonly DirectoryItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export type DirectoryStatus =
  | "all"
  | "unclaimed"
  | "claimed"
  | "flagged"
  | "no_user"
  | "no_email"
  | "non_gmail"
  | "duplicate"
  | "link_active"
  | "link_revoked";

export const loadDirectory = async (
  academicId: number,
  filters: {
    readonly persona?: "all" | Persona;
    readonly status?: DirectoryStatus;
    readonly search?: string;
    readonly page?: number;
    readonly pageSize?: number;
  } = {}
): Promise<DirectoryPage> => {
  const params = new URLSearchParams();
  if (filters.persona !== undefined) params.set("persona", filters.persona);
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.search !== undefined) params.set("search", filters.search);
  params.set("page", String(filters.page ?? 1));
  params.set("pageSize", String(filters.pageSize ?? 50));
  return await call<DirectoryPage>(academicId, `/api/v1/admin/claim-links?${params.toString()}`);
};

export interface CreatedClaimLink {
  readonly id: string;
  readonly url: string;
  readonly expiresAt: number;
}

/** Mints a one-time link. The raw token exists only in this response. */
export const createClaimLink = async (
  academicId: number,
  input: { readonly subjectType: Persona; readonly subjectId: number; readonly ttlHours?: number }
): Promise<CreatedClaimLink> =>
  await call<CreatedClaimLink>(academicId, "/api/v1/admin/claim-links", {
    method: "POST",
    body: { ...input, ttlHours: input.ttlHours ?? 72 }
  });

export const revokeClaimLink = async (academicId: number, linkId: string): Promise<void> => {
  await call<null>(academicId, `/api/v1/admin/claim-links/${linkId}/revoke`, { method: "POST" });
};

/* ── Duplicates ─────────────────────────────────────────────────────────── */

export interface DuplicateAccount {
  readonly userId: number;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly activeStatus: number | null;
  readonly claimStatus: "pending" | "claimed" | "flagged" | null;
  readonly persona: Persona | "unlinked";
  readonly personas: readonly Persona[];
  /** How many live sessions this account holds — the signal for "which one is real". */
  readonly sessionCount: number;
  readonly providers: readonly string[];
  readonly lastLoginAt: number | null;
}

export interface DuplicateGroup {
  readonly email: string;
  readonly resolution: "unresolved" | "flagged" | "resolved";
  readonly accounts: readonly DuplicateAccount[];
}

export const loadDuplicates = async (academicId: number): Promise<readonly DuplicateGroup[]> => {
  const response = await call<{ groups: readonly DuplicateGroup[] }>(
    academicId,
    "/api/v1/admin/duplicate-emails"
  );
  return response.groups;
};

/** The CSV is downloaded, not rendered: a duplicate report is read in a spreadsheet. */
export const duplicateExportUrl = (academicId: number): string =>
  `${apiBase()}/api/v1/admin/duplicate-emails/export?academicId=${academicId}`;

export const reassignEmail = async (
  academicId: number,
  input: { readonly email: string; readonly targetUserId: number }
): Promise<void> => {
  await call<null>(academicId, "/api/v1/admin/duplicate-emails/reassign", {
    method: "POST",
    body: input
  });
};

export const mergeAccounts = async (
  academicId: number,
  input: { readonly email: string; readonly keepUserId: number; readonly mergeUserIds: readonly number[] }
): Promise<void> => {
  await call<null>(academicId, "/api/v1/admin/duplicate-emails/merge", {
    method: "POST",
    body: input
  });
};

export const flagAccount = async (academicId: number, userId: number): Promise<void> => {
  await call<null>(academicId, "/api/v1/admin/duplicate-emails/flag", {
    method: "POST",
    body: { userId }
  });
};

/* ── Issues ─────────────────────────────────────────────────────────────── */

export type IssueType = "unclaimed_account" | "unlinked_parent" | "duplicate_email" | "missing_email";
export type IssueSeverity = "critical" | "warning" | "info";

export interface IssueSubject {
  readonly persona: Persona;
  readonly subjectId: number;
  readonly userId: number | null;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface Issue {
  readonly id: string;
  readonly type: IssueType;
  readonly severity: IssueSeverity;
  readonly status: "open";
  readonly title: string;
  readonly summary: string;
  readonly subject: IssueSubject;
  readonly evidence: readonly string[];
  readonly actions: readonly { readonly id: string; readonly label: string }[];
}

export interface IssuePage {
  readonly items: readonly Issue[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Counts per issue type for the whole school, not just this page. */
  readonly counts: Readonly<Record<IssueType, number>>;
}

export const loadIssues = async (
  academicId: number,
  filters: { readonly type?: "all" | IssueType; readonly severity?: "all" | IssueSeverity; readonly search?: string; readonly page?: number } = {}
): Promise<IssuePage> => {
  const params = new URLSearchParams();
  if (filters.type !== undefined) params.set("type", filters.type);
  if (filters.severity !== undefined) params.set("severity", filters.severity);
  if (filters.search !== undefined) params.set("search", filters.search);
  params.set("page", String(filters.page ?? 1));
  return await call<IssuePage>(academicId, `/api/v1/admin/issues?${params.toString()}`);
};

/* ── Classes and roster ─────────────────────────────────────────────────── */

export interface ClassSection {
  readonly classId: number;
  readonly className: string | null;
  readonly sectionId: number;
  readonly sectionName: string | null;
  readonly label: string;
}

/** The classes this caller may open a roster for — every one for an admin, their own for a teacher. */
export const loadMyClasses = async (academicId: number): Promise<readonly ClassSection[]> => {
  const response = await call<{ classes: readonly ClassSection[] }>(academicId, "/api/v1/me/classes");
  return response.classes;
};

/**
 * One row of `GET /students`, matching `StudentSummaryDto` exactly.
 *
 * The DTO is the contract; a client interface that renames its fields (`id` → `studentId`)
 * compiles and then renders `undefined` everywhere, which is how the roster table came back
 * empty with a 200 on the wire.
 */
export interface RosterStudent {
  readonly id: number;
  readonly fullName: string;
  readonly admissionNo: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly activeStatus: number | null;
}

/**
 * One section's roster.
 *
 * The class and section travel as headers because the route is class-scoped on the server:
 * `requireClassScope` reads them, and `TenantScopeService` then proves the caller may open
 * that section. They are not query parameters, so a roster cannot be requested for a class the
 * caller does not hold.
 */
export const loadRoster = async (
  academicId: number,
  target: { readonly classId: number; readonly sectionId: number },
  query?: string
): Promise<readonly RosterStudent[]> => {
  const params = new URLSearchParams({ limit: "200" });
  if (query !== undefined && query.length > 0) params.set("q", query);

  const response = await apiFetch(`/api/v1/students?${params.toString()}`, apiBase(), {
    headers: {
      "X-Academic-Id": String(academicId),
      "X-Class-Id": String(target.classId),
      "X-Section-Id": String(target.sectionId)
    }
  });
  if (!response.ok) {
    throw new Error(readMessage(response.data, `Request failed (${response.status})`));
  }
  const body = response.data as { rows?: readonly RosterStudent[] };
  return body.rows ?? [];
};
