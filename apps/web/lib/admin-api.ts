import { apiBase } from "@/lib/api";
import { apiFetch, readMessage } from "@/lib/api-transport";

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
