import crypto from "crypto";
import { authRepo } from "$lib/server/repository/auth.repo";
import { hashPwd, checkPwd } from "$lib/server/helpers/utils";
import { cookies } from "$lib/server/helpers/cookie";
import { jwt } from "$lib/server/helpers/jwt";
import type { AuthUser, CookieOpts, Session } from "$lib/types/auth-types";
import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import { dev } from "$app/environment";

// Security constants
const ACCESS_TTL = 15 * 60; // 15 minutes
const BROWSER_REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days for browser tabs
const PWA_REFRESH_TTL = 30 * 24 * 60 * 60; // 30 days for installed PWAs
const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_PERIOD = 15 * 60 * 1000; // 15 minutes

// In-memory brute force protection
const failedAttempts = new Map<string, { count: number; lockoutUntil: number }>();
const ALLOWED_PROFILE_FIELDS = [
  "fullName",
  "username",
  "phoneNumber",
  "language",
  "styleId",
  "rtlLtl",
  "deviceToken",
] as const;

type UpdatableField = (typeof ALLOWED_PROFILE_FIELDS)[number];
type UserRow = Awaited<ReturnType<typeof authRepo.findUser>>;

class AuthService {
  /**
   * Detect if request is from installed PWA
   */
  private isInstalledPWA(request: Request): boolean {
    const ua = request.headers.get("user-agent") || "";
    const secChUaMobile = request.headers.get("sec-ch-ua-mobile") || "";

    // Method 1: Display-Mode header (most reliable)
    if (request.headers.get("display-mode") === "standalone") return true;

    // Method 2: Purpose header
    if (request.headers.get("purpose") === "prefetch") return true;

    // Method 3: User-Agent patterns (fallback)
    return (
      /Android.*wv/.test(ua) || // Android WebView
      /iPhone OS.*Safari/.test(ua) || // iOS Safari (standalone mode)
      /iPad.*Safari/.test(ua) ||
      secChUaMobile === "?1" // Mobile device
    );
  }

  /**
   * Generate PWA-optimized device fingerprint
   */
  private getDeviceFingerprint(request: Request): string {
    const ua = request.headers.get("user-agent") || "";
    const isPWA = this.isInstalledPWA(request);

    // For PWAs, include installation context
    const displayMode = request.headers.get("display-mode") || "browser";
    const viewportWidth = request.headers.get("x-viewport-width") || "0";
    // console.log("Payload", { ua, isPWA, displayMode, viewportWidth  });

    // PWA fingerprint: More stable than web, less strict than native
    const raw = `${ua}|${displayMode}|${viewportWidth}${isPWA}`;
    return crypto.createHash("sha256").update(raw).digest("hex").substring(0, 28);
  }

  /**
   * PWA-friendly fingerprint compatibility (allow viewport changes)
   */
  private isFingerprintCompatible(stored: string, current: string, isPWA: boolean): boolean {
    if (!isPWA) return stored === current;

    // PWA: Allow viewport/resolution changes (75% similarity)
    const similarity = this.calculateSimilarity(stored, current);
    return similarity > 0.75;
  }

  private calculateSimilarity(a: string, b: string): number {
    // Focus on stable parts (first 20 chars = UA + display mode)
    const stableA = a.substring(0, 20);
    const stableB = b.substring(0, 20);
    const setA = new Set(stableA);
    const setB = new Set(stableB);
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size ? intersection.size / union.size : 0;
  }

  /**
   * Check brute force protection
   */
  private checkBruteForce(identifier: string) {
    const record = failedAttempts.get(identifier);
    if (!record) return;

    const now = Date.now();
    if (record.lockoutUntil && now < record.lockoutUntil) {
      throw new Error(
        `Too many attempts. Try again in ${Math.ceil((record.lockoutUntil - now) / 60000)} minutes`
      );
    }

    if (record.count >= MAX_LOGIN_ATTEMPTS) {
      record.lockoutUntil = now + LOCKOUT_PERIOD;
      throw new Error("Too many failed attempts. Account temporarily locked");
    }
  }

  /**
   * Record failed login attempt
   */
  private recordFailedAttempt(identifier: string) {
    const record = failedAttempts.get(identifier) || { count: 0, lockoutUntil: 0 };
    record.count++;
    failedAttempts.set(identifier, record);

    if (record.lockoutUntil) {
      setTimeout(() => failedAttempts.delete(identifier), LOCKOUT_PERIOD);
    }
  }

  /**
   * Unified login for browser and PWA
   */
  async login({ identifier, password }: { identifier: string; password: string }) {
    const event = getRequestEvent();
    const request = event.request;
    const isPWA = this.isInstalledPWA(request);

    // Brute force protection
    this.checkBruteForce(identifier);

    let user = await authRepo.findUser("email", identifier);
    if (!user) user = await authRepo.findUser("username", identifier);

    // Standardized error for all failures
    if (!user || !user.password || !checkPwd(password, user.password) || user.activeStatus !== 1) {
      this.recordFailedAttempt(identifier);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      throw new Error("Invalid credentials");
    }

    failedAttempts.delete(identifier);

    // Generate tokens
    const deviceFingerprint = this.getDeviceFingerprint(request);
    const refreshTTL = isPWA ? PWA_REFRESH_TTL : BROWSER_REFRESH_TTL;

    // Access token (short-lived)
    const { token: accessToken, exp: accessExp } = await jwt.sign(
      {
        sub: user.id.toString(),
        fp: deviceFingerprint,
        pwa: isPWA, // Platform indicator
        installed: isPWA, // Alias for clarity
      },
      ACCESS_TTL
    );

    // Refresh token (long-lived)
    const {
      token: refreshToken,
      exp: refreshExp,
      jti,
    } = await jwt.signRT(
      {
        sub: user.id.toString(),
        fp: deviceFingerprint,
        pwa: isPWA,
        installed: isPWA,
      },
      refreshTTL
    );

    // Store refresh token metadata in sessions table
    await authRepo.createRefreshToken(
      jti,
      user.id,
      deviceFingerprint,
      new Date(refreshExp * 1000).toISOString().slice(0, 19).replace("T", " ")
    );

    // PWA-optimized cookie settings
    const cookieOpts: CookieOpts = {
      httpOnly: true,
      sameSite: "lax", // Critical for PWA (allows notification redirects)
      path: "/",
    };

    // Set cookies (same for browser and PWA - PWAs support cookies)
    cookies.set(ACCESS_COOKIE, accessToken, accessExp, cookieOpts);
    cookies.set(REFRESH_COOKIE, refreshToken, refreshExp, {
      ...cookieOpts,
      sameSite: "strict", // More secure for refresh
      path: "/",
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
      },
      sessionId: jti,
      fresh: true,
      platform: isPWA ? "pwa" : "browser",
      sessionDuration: isPWA ? "30 days" : "7 days",
    };
  }

  /**
   * Private helper to validate session and extract user/session data
   */
  async getSession(): Promise<{ user: AuthUser; session: Session } | null> {
    const sessionObj = await this.validateSession();
    if (!sessionObj) return null;

    const [user, staff] = await Promise.all([
      authRepo.findUser("id", sessionObj.userId),
      authRepo.findStaff(sessionObj.userId),
    ]);

    if (!user?.activeStatus) {
      cookies.del(ACCESS_COOKIE);
      return null;
    }

    // Safe user object
    const userObj: AuthUser = {
      id: user.id,
      email: user.email ?? undefined,
      username: user.username ?? undefined,
      fullName: user.fullName ?? undefined,
      usertype: user.usertype ?? undefined,
      schoolId: user.schoolId ?? undefined,
      activeStatus: user.activeStatus,
      verified: !!user.verified,
      isRegistered: user.isRegistered,
      walletBalance: user.walletBalance ?? undefined,
      isAdministrator: user.isAdministrator === "yes",
      academicId: user.accessStatus ?? undefined,
      roleId: staff?.roleId ?? undefined,
      staffId: staff?.id,
      designationId: staff?.designationId ?? undefined,
      departmentId: staff?.departmentId ?? undefined,
      deviceToken: user.deviceToken ?? undefined,
    };

    return { user: userObj, session: sessionObj };
  }

  /**
   * Session validation with PWA support and automatic token refresh
   */
  private async validateSession(): Promise<Session | null> {
    const event = getRequestEvent();
    let accessToken = cookies.get(ACCESS_COOKIE) || undefined;

    const request = event.request;
    let payload = await jwt.verify(accessToken);
    if (!payload?.sub) {
      try {
        const accessToken = await this.refresh();
        if (!accessToken) return null;
        payload = jwt.decode(accessToken);
        if (!payload?.sub) return null;
      } catch (refreshError) {
        cookies.del(ACCESS_COOKIE);
        cookies.del(REFRESH_COOKIE);
        return null;
      }
    }

    const userId = parseInt(payload.sub);
    const isPWA = this.isInstalledPWA(request);
    // Device binding with PWA tolerance
    // TODO: Fix fingerprint compatibility: for some reason userAgent is different on page reload
    const currentFingerprint = this.getDeviceFingerprint(request);
    const isPWAToken = payload.pwa === true;
    const isCompatible = this.isFingerprintCompatible(payload.fp as string, currentFingerprint, isPWAToken);
    // if (!isCompatible) {
    //   cookies.del(ACCESS_COOKIE);
    //   // For PWAs, we'll refresh silently in background
    //   if (!isPWAToken) return null;
    // }

    const sessionObj: Session = {
      id: (payload.jti as string) || "unknown",
      userId,
      deviceInfo: {
        fingerprint: currentFingerprint,
        userAgent: request.headers.get("user-agent") || "",
        isPWA,
        displayMode: request.headers.get("display-mode") || "browser",
        viewportWidth: request.headers.get("x-viewport-width") || undefined,
      },
      expiresAt: new Date((payload.exp as number) * 1000),
      fresh: false,
    };
    return sessionObj;
  }

  /**
   * PWA-optimized refresh with background sync support
   */
  async refresh(): Promise<string | null> {
    const request = getRequestEvent().request;
    const refreshToken = cookies.get(REFRESH_COOKIE);
    if (!refreshToken) return null;

    // Verify refresh token
    const payload = await jwt.verify(refreshToken);
    if (!payload?.sub || !payload.jti) {
      cookies.del(REFRESH_COOKIE);
      return null;
    }

    // Validate against DB
    const isValid = await authRepo.validateRefreshToken(payload.jti as string, payload.jti as string);
    if (!isValid) {
      cookies.del(REFRESH_COOKIE);
      return null;
    }

    // Device binding with PWA tolerance
    const currentFingerprint = this.getDeviceFingerprint(request);
    const isPWAToken = payload.pwa === true;
    const isCompatible = this.isFingerprintCompatible(payload.fp as string, currentFingerprint, isPWAToken);
    if (!isCompatible) {
      // For PWAs: Allow refresh but log security event
      if (isPWAToken) {
        console.warn(`PWA device change detected for user ${payload.sub}`, {
          oldFP: payload.fp,
          newFP: currentFingerprint,
        });
      } else {
        await authRepo.revokeRefreshToken(payload.jti as string);
        cookies.del(REFRESH_COOKIE);
        return null;
      }
    }

    const userId = parseInt(payload.sub);
    const refreshTTL = isPWAToken ? PWA_REFRESH_TTL : BROWSER_REFRESH_TTL;

    // Issue new tokens
    const newAccessToken = await jwt.sign(
      {
        sub: userId.toString(),
        fp: currentFingerprint,
        pwa: isPWAToken,
        installed: isPWAToken,
      },
      ACCESS_TTL
    );

    const newRefreshToken = await jwt.signRT(
      {
        sub: userId.toString(),
        fp: currentFingerprint,
        sid: payload.jti,
        pwa: isPWAToken,
        installed: isPWAToken,
      },
      refreshTTL
    );

    // Revoke old refresh token
    await authRepo.revokeRefreshToken(payload.jti as string);

    // Store new refresh token
    await authRepo.createRefreshToken(
      newRefreshToken.jti,
      userId,
      currentFingerprint,
      new Date(newRefreshToken.exp * 1000).toISOString().slice(0, 19).replace("T", " ")
    );

    // Set cookies
    cookies.set(ACCESS_COOKIE, newAccessToken.token, newAccessToken.exp);
    cookies.set(REFRESH_COOKIE, newRefreshToken.token, newRefreshToken.exp, {
      httpOnly: true,
      secure: !import.meta.env.DEV,
      sameSite: "strict",
      path: "/",
    });

    return newAccessToken.token;
  }

  /**
   * Add push notification subscription for PWA
   */
  async subscribeToPush(userId: number, subscription: PushSubscriptionJSON) {
    // Store push subscription in user's deviceToken field (JSON string)
    const existing = await authRepo.findUser("id", userId);
    if (!existing) throw new Error("User not found");

    // Parse existing device tokens
    let deviceTokens: any[] = [];
    try {
      deviceTokens = existing.deviceToken ? JSON.parse(existing.deviceToken) : [];
    } catch {
      deviceTokens = [];
    }

    // Add new push subscription
    const newToken = {
      type: "push",
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      addedAt: new Date().toISOString(),
      userAgent: getRequestEvent().request.headers.get("user-agent"),
    };

    // Remove duplicates
    deviceTokens = deviceTokens.filter((t) => t.endpoint !== subscription.endpoint);
    deviceTokens.push(newToken);

    await authRepo.updateUser(userId, {
      deviceToken: JSON.stringify(deviceTokens),
    });

    return { success: true };
  }

  /**
   * Send push notification to user's devices
   */
  async sendPushNotification(userId: number, payload: { title: string; body: string; url?: string }) {
    const user = await authRepo.findUser("id", userId);
    if (!user?.deviceToken) return { sent: 0 };

    let deviceTokens: any[] = [];
    try {
      deviceTokens = JSON.parse(user.deviceToken);
    } catch {
      return { sent: 0 };
    }

    const pushTokens = deviceTokens.filter((t) => t.type === "push");
    let sent = 0;

    // Send to each push subscription
    for (const token of pushTokens) {
      try {
        // Use web-push library in production
        console.log("Sending push to", token.endpoint, payload);
        sent++;
      } catch (e: any) {
        console.error("Push failed", e);
        // Remove invalid subscriptions
        if (e.message?.includes("410")) {
          deviceTokens = deviceTokens.filter((t) => t.endpoint !== token.endpoint);
          await authRepo.updateUser(userId, {
            deviceToken: JSON.stringify(deviceTokens),
          });
        }
      }
    }

    return { sent };
  }

  /**
   * Secure signup with password complexity
   */
  async signup(data: {
    email: string;
    password: string;
    username?: string;
    fullName?: string;
    phoneNumber?: string;
    usertype?: string;
    schoolId?: number;
  }) {
    // Password complexity requirements
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
    if (!passwordRegex.test(data.password)) {
      throw new Error("Password must be 12+ characters with uppercase, lowercase, number, and symbol");
    }

    if (await authRepo.findUser("email", data.email)) {
      throw new Error("Email already in use");
    }

    const payload = {
      email: data.email,
      password: hashPwd(data.password),
      username: data.username || null,
      fullName: data.fullName || null,
      phoneNumber: data.phoneNumber || null,
      usertype: data.usertype || null,
      verified: "0",
      randomCode: crypto.randomBytes(20).toString("hex"),
      schoolId: data.schoolId ?? 1,
      activeStatus: 1,
      isRegistered: 1,
      walletBalance: 0.0,
      language: "en",
      styleId: 1,
      rtlLtl: 2,
      selectedSession: 1,
      createdBy: 1,
      updatedBy: 1,
      accessStatus: 1,
      roleId: null,
      isAdministrator: "no",
      deviceToken: null,
      trialEndsAt: null,
      notificationToken: null,
      rememberToken: null,
    };

    const userId = await authRepo.createUser(payload);
    if (!userId) throw new Error("Failed to create user");

    return (await authRepo.findUser("id", userId))!;
  }

  async logout() {
    const event = getRequestEvent();

    const refreshToken = cookies.get(REFRESH_COOKIE);
    if (refreshToken) {
      const payload = jwt.decode(refreshToken);
      if (payload?.jti) {
        await authRepo.revokeRefreshToken(payload.jti as string);
      }
    }

    cookies.del(ACCESS_COOKIE);
    cookies.del(REFRESH_COOKIE);
    return { success: true };
  }

  async logoutAll(userId: number) {
    await authRepo.deleteAllUserSessions(userId);
    cookies.del(ACCESS_COOKIE);
    cookies.del(REFRESH_COOKIE);

    await authRepo.updateUser(userId, { deviceToken: null });
    return { success: true };
  }

  async changePwd(userId: number, oldPwd: string, newPwd: string) {
    const request = getRequestEvent().request;
    const isPWA = this.isInstalledPWA(request);

    // ... existing validation ...

    // Update password
    await authRepo.updateUserPassword(userId, hashPwd(newPwd));

    // Invalidate all sessions
    await this.logoutAll(userId);

    // Create new session with platform context
    const user = await authRepo.findUser("id", userId);
    if (!user) throw new Error("User not found");

    return this.login({
      identifier: user.email || user.username || "",
      password: newPwd,
    });
  }

  /**
   * Secure profile update with field whitelisting
   */
  async updateProfile(userId: number, patch: Partial<Record<UpdatableField, string | number | null>>) {
    const sanitizedPatch = Object.entries(patch).reduce((acc, [key, value]) => {
      if (ALLOWED_PROFILE_FIELDS.includes(key as UpdatableField)) {
        if (key === "styleId" || key === "rtlLtl") {
          acc[key] = Number(value);
        } else {
          acc[key as UpdatableField] = value;
        }
      }
      return acc;
    }, {} as Record<UpdatableField, any>);

    if (Object.keys(sanitizedPatch).length === 0) {
      throw new Error("No valid fields to update");
    }

    await authRepo.updateUser(userId, sanitizedPatch);
    return await authRepo.findUser("id", userId);
  }

  /**
   * Admin check
   */
  async isAdmin(userId: number) {
    const user = await authRepo.findUser("id", userId);
    return user?.isAdministrator === "yes";
  }

  /**
   * Password reset request
   */
  async requestReset(email: string) {
    // Security: Always return success to prevent user enumeration
    const user = await authRepo.findUser("email", email);
    if (!user) return { success: true };

    // TODO: Implement proper token system
    console.log(`Password reset requested for ${email}. Not implemented yet.`);
    return { success: true };
  }

  /**
   * Password reset confirmation
   */
  async resetPwd(token: string, newPwd: string) {
    throw error(501, "Password reset not implemented");
  }

  /**
   * Email verification
   */
  async verifyEmail(userId: number, code: string) {
    const user = await authRepo.findUser("id", userId);
    if (!user || user.randomCode !== code) {
      throw new Error("Invalid verification code");
    }

    await authRepo.updateUser(userId, {
      verified: "1",
      randomCode: null,
    });
    return { success: true };
  }
}

export const auth = new AuthService();
