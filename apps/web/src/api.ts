import type { CapabilityManifest } from "@edapex/contracts";

export type Persona = "staff" | "parent";
export type LinkStatus = "none" | "active" | "expired" | "used" | "revoked";

export interface ClaimDirectoryItem {
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

export interface ClaimDirectoryPage {
  readonly items: readonly ClaimDirectoryItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreatedClaimLink {
  readonly id: string;
  readonly url: string;
  readonly expiresAt: number;
}

export interface SessionUser {
  readonly id: number;
  readonly fullName: string | null;
  readonly email: string | null;
}

export interface SessionView {
  readonly user: SessionUser;
  readonly sessionId: string;
  readonly expiresAt: number;
}

export interface DirectoryFilters {
  readonly persona: "all" | Persona;
  readonly status: string;
  readonly search: string;
  readonly page: number;
  readonly pageSize: number;
}

const envBase = import.meta.env.VITE_API_BASE_URL;
const API_BASE = typeof envBase === "string" ? envBase : "";

export const apiBase = (): string => API_BASE;

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return (await response.json()) as T;
};

export const getSession = async (): Promise<SessionView | null> => {
  const response = await fetch(`${API_BASE}/api/v1/me`, { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Session check failed (${response.status})`);
  return (await response.json()) as SessionView;
};

export const loadCapabilities = async (
  academicId: number
): Promise<CapabilityManifest> =>
  request<CapabilityManifest>("/api/v1/agent/capabilities", {
    headers: { "X-Academic-Id": String(academicId) }
  });

export const loadDirectory = async (
  academicId: number,
  filters: DirectoryFilters
): Promise<ClaimDirectoryPage> => {
  const params = new URLSearchParams({
    persona: filters.persona,
    status: filters.status,
    search: filters.search,
    page: String(filters.page),
    pageSize: String(filters.pageSize)
  });
  return request<ClaimDirectoryPage>(`/api/v1/admin/claim-links?${params.toString()}`, {
    headers: { "X-Academic-Id": String(academicId) }
  });
};

export const createClaimLink = async (
  academicId: number,
  item: ClaimDirectoryItem
): Promise<CreatedClaimLink> =>
  request<CreatedClaimLink>("/api/v1/admin/claim-links", {
    method: "POST",
    headers: { "X-Academic-Id": String(academicId) },
    body: JSON.stringify({
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      ttlHours: 72
    })
  });

export const revokeClaimLink = async (
  academicId: number,
  linkId: string
): Promise<void> => {
  await fetch(`${API_BASE}/api/v1/admin/claim-links/${linkId}/revoke`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Academic-Id": String(academicId) }
  });
};

export const requestMagicLink = async (email: string): Promise<void> => {
  await request<{ status: string }>("/api/v1/auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ email })
  });
};
