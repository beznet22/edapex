import type { AuthUser, SessionView } from "../../services";

export interface UserDto {
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

export interface SessionDto {
  readonly user: UserDto;
  readonly sessionId: string;
  readonly expiresAt: number;
}

export const toUserDto = (user: AuthUser): UserDto => ({
  id: user.id,
  email: user.email,
  username: user.username,
  fullName: user.fullName,
  schoolId: user.schoolId,
  roleId: user.roleId,
  staffId: user.staffId,
  designationId: user.designationId,
  isAdmin: user.isAdmin
});

export const toSessionDto = (session: SessionView): SessionDto => ({
  user: toUserDto(session.user),
  sessionId: session.sessionId,
  expiresAt: session.expiresAt
});
