import { BaseRepository } from "./base.repo";
import { accounts, users, sessions } from "../db/domain-core";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

type AccountRow = typeof accounts.$inferSelect;
type UserRow = typeof users.$inferSelect;

export class AuthRepository extends BaseRepository {
  /**
   * Find account by field (id, email, or username) - Identity Layer
   */
  async findAccount(field: "id" | "email" | "username", val: string | number) {
    const col = field === "id" ? accounts.id : field === "email" ? accounts.email : accounts.username;
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(col, val as any))
      .limit(1);
    return rows[0] as AccountRow | undefined;
  }

  /**
   * Find user by account ID - Persona Layer
   */
  async findUserByAccountId(accountId: string): Promise<UserRow | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.accountId, accountId))
      .limit(1);
    return rows[0];
  }

  async findUser(field: "id" | "email" | "username", val: string | number) {
    const col = field === "id" ? users.id : field === "email" ? accounts.email : accounts.username;
    const [row] = await this.db
      .select({
        id: users.id,
        accountId: users.accountId,
        email: accounts.email,
        username: accounts.username,
        password: accounts.password,
        fullName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        activeStatus: users.activeStatus,
        verified: accounts.verified,
        isRegistered: accounts.isRegistered,
        walletBalance: accounts.walletBalance,
        isAdministrator: accounts.isAdministrator,
        accessStatus: accounts.accessStatus,
        roleId: accounts.roleId,
        deviceToken: accounts.deviceToken,
        randomCode: accounts.randomCode,
        usertype: users.userType,
        schoolId: accounts.tenantId,
      })
      .from(users)
      .innerJoin(accounts, eq(users.accountId, accounts.id))
      .where(eq(col, val as any))
      .limit(1);
    return row;
  }

  async findStaff(userId: number) {
    const [row] = await this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        designationId: sql<number>`CAST(${users.metadata}->>'$.designationId' AS UNSIGNED)`,
        departmentId: sql<number>`CAST(${users.metadata}->>'$.departmentId' AS UNSIGNED)`,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.userType, "staff")))
      .limit(1);
    return row;
  }

  async createRefreshToken(jti: string, userId: number, fingerprint: string, expiresAt: string) {
    const [user] = await this.db.select({ accountId: users.accountId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.accountId) return;
    await this.db.insert(sessions).values({
      id: jti,
      userId: user.accountId,
      expiresAt: new Date(expiresAt),
    });
  }

  async validateRefreshToken(jti: string, token: string) {
    const [session] = await this.db.select().from(sessions).where(eq(sessions.id, jti)).limit(1);
    if (!session || session.expiresAt.getTime() < Date.now()) return false;
    return true;
  }

  async revokeRefreshToken(jti: string) {
    await this.db.delete(sessions).where(eq(sessions.id, jti));
  }

  async deleteAllUserSessions(userId: number) {
    const [user] = await this.db.select({ accountId: users.accountId }).from(users).where(eq(users.id, userId)).limit(1);
    if (user?.accountId) {
      await this.db.delete(sessions).where(eq(sessions.userId, user.accountId));
    }
  }

  async updateUserPassword(userId: number, hashedPassword: string) {
    const [user] = await this.db.select({ accountId: users.accountId }).from(users).where(eq(users.id, userId)).limit(1);
    if (user?.accountId) {
      await this.db.update(accounts).set({ password: hashedPassword }).where(eq(accounts.id, user.accountId));
    }
  }

  async updateUser(userId: number, patch: any) {
    const [user] = await this.db.select({ accountId: users.accountId }).from(users).where(eq(users.id, userId)).limit(1);
    const userPatch: any = {};
    const accountPatch: any = {};
    
    if ('fullName' in patch && typeof patch.fullName === 'string') {
      const parts = patch.fullName.split(' ');
      userPatch.firstName = parts[0];
      userPatch.lastName = parts.slice(1).join(' ');
    }
    if ('username' in patch) accountPatch.username = patch.username;
    if ('phoneNumber' in patch) accountPatch.phoneNumber = patch.phoneNumber;
    if ('language' in patch) accountPatch.language = patch.language;
    if ('styleId' in patch) accountPatch.styleId = patch.styleId;
    if ('rtlLtl' in patch) accountPatch.rtlLtl = patch.rtlLtl;
    if ('deviceToken' in patch) accountPatch.deviceToken = patch.deviceToken;
    if ('verified' in patch) accountPatch.verified = patch.verified;
    if ('randomCode' in patch) accountPatch.randomCode = patch.randomCode;
    
    if (Object.keys(userPatch).length > 0) {
      await this.db.update(users).set(userPatch).where(eq(users.id, userId));
    }
    if (Object.keys(accountPatch).length > 0 && user?.accountId) {
      await this.db.update(accounts).set(accountPatch).where(eq(accounts.id, user.accountId));
    }
  }

  async createUser(payload: any) {
    const accountId = crypto.randomUUID();
    const tenantId = payload.schoolId || payload.tenantId || 1;
    await this.db.insert(accounts).values({
      id: accountId,
      email: payload.email,
      password: payload.password,
      username: payload.username,
      phoneNumber: payload.phoneNumber,
      activeStatus: payload.activeStatus,
      verified: payload.verified,
      randomCode: payload.randomCode,
      isRegistered: payload.isRegistered,
      walletBalance: payload.walletBalance,
      language: payload.language,
      styleId: payload.styleId,
      rtlLtl: payload.rtlLtl,
      selectedSession: payload.selectedSession,
      accessStatus: payload.accessStatus,
      roleId: payload.roleId,
      isAdministrator: payload.isAdministrator,
      deviceToken: payload.deviceToken,
      trialEndsAt: payload.trialEndsAt ? new Date(payload.trialEndsAt) : null,
      notificationToken: payload.notificationToken,
      rememberToken: payload.rememberToken,
      tenantId: tenantId,
    } as any);
    
    let firstName = "User";
    let lastName = "Name";
    if (payload.fullName) {
      const parts = payload.fullName.split(" ");
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }
    
    const [res] = await this.db.insert(users).values({
      tenantId: tenantId,
      accountId,
      userType: payload.usertype || "student",
      firstName,
      lastName,
      email: payload.email,
      mobile: payload.phoneNumber,
      activeStatus: payload.activeStatus,
    }).$returningId();
    return res?.id;
  }
}

export const authRepo = new AuthRepository();
