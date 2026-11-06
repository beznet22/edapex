import type {
  authCodes,
  authIdentities,
  authSessions,
  infixRoles,
  smStaffs,
  users
} from "../../db/schema";

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ClaimStatus = NonNullable<UserRow["claimStatus"]>;
export type UserLookupField = "id" | "email" | "username";
export type RoleRow = typeof infixRoles.$inferSelect;
export type AuthStaffRow = typeof smStaffs.$inferSelect;
export type AuthIdentityRow = typeof authIdentities.$inferSelect;
export type NewAuthIdentity = typeof authIdentities.$inferInsert;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type AuthCodeRow = typeof authCodes.$inferSelect;
export type NewAuthCode = typeof authCodes.$inferInsert;

/** Columns a user profile update may touch; `password` and `id` are excluded. */
export type UserPatch = Partial<
  Pick<
    NewUser,
    | "fullName"
    | "username"
    | "phoneNumber"
    | "email"
    | "activeStatus"
    | "language"
    | "roleId"
    | "isRegistered"
    | "styleId"
    | "rtlLtl"
    | "deviceToken"
  >
>;

export interface NewSession {
  readonly id: string;
  readonly userId: number;
  readonly tokenHash: string;
  readonly expiresAt: number;
  readonly deviceFingerprint: string | null;
  readonly createdAt: number;
}

export interface SessionWithUser {
  readonly session: AuthSessionRow;
  readonly user: UserRow;
}
