import type { smStaffs, users } from "$lib/server/db/sms-schema";
import type { JWTPayload } from "jose";



type StaffRow = typeof smStaffs.$inferSelect;
type AuthUserV2 = typeof users.$inferSelect;

export interface AuthUser {
  id: number;
  roleId?: number;
  staffId?: number;
  designationId?: number;
  departmentId?: number;
  activeStatus?: number;
  fullName?: string;
  username?: string;
  email?: string;
  usertype?: string;
  isRegistered?: number;
  isAdministrator?: boolean;
  verified?: boolean;
  deviceToken?: string;
  walletBalance?: number;
  schoolId?: number;
  academicId?: number;
}

export interface DeviceInfo {
  os?: string;
  ip?: string;
  fingerprint: string;
  userAgent: string;
  isPWA: boolean;
  displayMode?: string;
  viewportWidth?: string;
}

export interface Session {
  id: string;
  userId: number;
  expiresAt?: Date;
  deviceInfo?: DeviceInfo;
  fresh?: boolean;
}

export interface CookieOpts {
  name?: string;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  maxAge?: number;
}

export interface AuthConfig {
  accessCookie?: string;
  refreshCookie?: string;
  cookiePath?: string;
  cookieDomain?: string;
  cookieSecure?: boolean;
  accessTTL?: number;
  refreshTTL?: number;
  resetTTL?: number;
  bcryptRounds?: number;
}
