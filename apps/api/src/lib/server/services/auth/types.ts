export interface AuthUser {
  readonly id: number;
  readonly email: string | null;
  readonly username: string | null;
  readonly fullName: string | null;
  readonly schoolId: number | null;
  readonly roleId: number | null;
  readonly staffId: number | null;
  readonly designationId: number | null;
  readonly isAdmin: boolean;
}

export interface UserLike {
  readonly id: number;
  readonly email: string | null;
  readonly username: string | null;
  readonly fullName: string | null;
  readonly schoolId: number | null;
  readonly roleId: number | null;
  readonly isAdministrator: string;
}

export interface StaffLike {
  readonly id: number;
  readonly roleId?: number | null;
  readonly designationId?: number | null;
}

export interface SessionView {
  readonly sessionId: string;
  readonly expiresAt: number;
  readonly user: AuthUser;
}

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function toAuthUser(user: UserLike, staff: StaffLike | null): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    schoolId: user.schoolId,
    roleId: user.roleId ?? staff?.roleId ?? null,
    staffId: staff?.id ?? null,
    designationId: staff?.designationId ?? null,
    isAdmin: user.isAdministrator === "yes"
  };
}
