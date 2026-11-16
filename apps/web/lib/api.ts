import type { CapabilityManifest } from "@edapex/contracts";

import { apiFetch, hostKind, readMessage } from "@/lib/api-transport";

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

const envBase = process.env.NEXT_PUBLIC_API_BASE_URL;
const API_BASE =
  typeof envBase === "string" && envBase.length > 0
    ? envBase.replace(/\/+$/, "")
    : process.env.NODE_ENV === "production"
      ? "https://api.llacademy.ng"
      : "";

export const apiBase = (): string => API_BASE;

/**
 * One request on whichever transport this host has.
 *
 * Web uses the cookie; desktop and mobile go through the Rust `api_request` proxy, which
 * attaches the keychain token as a Bearer header. The WebView never sees the token.
 */
const request = async <T>(
  path: string,
  init: { readonly method?: string; readonly body?: unknown; readonly headers?: Readonly<Record<string, string>> } = {}
): Promise<T> => {
  const response = await apiFetch(path, API_BASE, init);
  if (!response.ok) {
    throw new Error(readMessage(response.data, `Request failed (${response.status})`));
  }
  return response.data as T;
};

export const getSession = async (): Promise<SessionView | null> => {
  const response = await apiFetch("/api/v1/me", API_BASE);
  // 401 is the anonymous case, not an error. On native the proxy throws instead of returning
  // a status, so the wrapper below normalises both paths into "no session".
  if (!response.ok) {
    if (response.status === 401) return null;
    throw new Error(`Session check failed (${response.status})`);
  }
  return response.data as SessionView;
};

export const signOut = async (): Promise<void> => {
  // Native hosts clear the keychain token; the web clears the cookie. Both are one call.
  if (hostKind() === "native") {
    const { authLogout } = await import("@/lib/tauri");
    await authLogout();
    return;
  }
  await request<null>("/api/v1/auth/logout", { method: "POST" });
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
    // `request` serialises the body itself; stringifying here too sent a JSON *string*
    // where the API expected an object, which Zod reported as "expected object, received
    // string" — on every create and every magic-link request.
    body: {
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      ttlHours: 72
    }
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

/**
 * Requests a sign-in link.
 *
 * Returns `devLink` when the API is running with the local console transport. In production
 * the field is null and the real link is only ever in the email.
 */
export const requestMagicLink = async (email: string): Promise<{ devLink: string | null }> => {
  const response = await request<{ status: string; devLink?: string | null }>(
    "/api/v1/auth/magic-link",
    { method: "POST", body: { email } }
  );
  return { devLink: response.devLink ?? null };
};
