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
  /**
   * The workspace this session acts in.
   *
   * Today it is the user's own id, because `AGENT_DB` has no workspaces table and agent data
   * (routines, tasks, conversations) is per-user. It is exposed as a named field rather than
   * having every caller write `String(session.user.id)` — that pattern is how a *user* id
   * ends up silently used as a *workspace* id, which is what happened in `useProactive`.
   *
   * A real shared workspace needs two things this does not pretend to have: a `workspaces`
   * table in `AGENT_DB` with membership, and a migration of existing `workspace_id` values.
   * Until then the value is stable and the name is honest.
   */
  readonly workspaceId: string;
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
  expiresAt: session.expiresAt,
  // Personal workspace: see the field comment. Kept numerically identical to the user id so
  // existing `workspace_id` values in `AGENT_DB` keep resolving.
  workspaceId: String(session.user.id)
});
