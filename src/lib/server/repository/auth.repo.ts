import { BaseRepository } from "./base.repo";
import { users, smStaffs } from "../db/sms-schema";
import { sessions } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { generateId } from "ai";

type UserRow = typeof users.$inferSelect;
type StaffRow = typeof smStaffs.$inferSelect;

export class AuthRepository extends BaseRepository {
  /**
   * Find user by field (id, email, or username)
   */
  async findUser(field: "id" | "email" | "username", val: string | number) {
    const col = field === "id" ? users.id : field === "email" ? users.email : users.username;
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(col, val as any))
      .limit(1);
    return rows[0] as UserRow | undefined;
  }

  /**
   * Find staff by user ID
   */
  async findStaff(userId: number): Promise<StaffRow | undefined> {
    const rows = await this.db.select().from(smStaffs).where(eq(smStaffs.userId, userId)).limit(1);
    return rows[0];
  }

  /**
   * Create a new session in the database
   */
  async createSession(sessionId: string, userId: number, deviceFingerprint: string, expiresAt: string) {
    await this.db.insert(sessions).values({
      id: sessionId,
      userId,
      expiresAt,
      deviceFingerprint,
    });
  }

  /**
   * Validate a session by ID
   */
  async validateSession(sessionId: string, currentFingerprint: string) {
    const sessionResult = await this.db
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(users.activeStatus, 1),
          // Atomic expiration check (UTC comparison)
          gt(sessions.expiresAt, new Date().toISOString().slice(0, 19).replace("T", " "))
        )
      )
      .limit(1);

    if (!sessionResult.length) return null;

    const { session, user } = sessionResult[0];

    // Device binding check
    if (session.deviceFingerprint !== currentFingerprint) {
      await this.deleteSession(sessionId);
      return null;
    }

    return { session, user };
  }

  /**
   * Delete a session by ID
   */
  async deleteSession(sessionId: string) {
    await this.db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  /**
   * Delete all sessions for a user
   */
  async deleteAllUserSessions(userId: number) {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  /**
   * Create refresh token record (reusing sessions table)
   */
  async createRefreshToken(
    sessionId: string,
    userId: number,
    deviceFingerprint: string,
    expiresAt: string
  ) {
    // First revoke any existing refresh tokens for this session
    await this.db.delete(sessions).where(and(eq(sessions.id, sessionId)));

    await this.db.insert(sessions).values({
      id: sessionId,
      userId,
      expiresAt,
      deviceFingerprint, // Store in existing sessions table
    });
  }

  /**
   * Validate refresh token against DB
   */
  async validateRefreshToken(jti: string, sessionId: string) {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          gt(sessions.expiresAt, new Date().toISOString().slice(0, 19).replace("T", " "))
        )
      );
    return rows.length > 0;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(sessionId: string) {
    await this.db.delete(sessions).where(and(eq(sessions.id, sessionId)));
  }

  /**
   * Update user password
   */
  async updateUserPassword(userId: number, hashedPassword: string) {
    await this.db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }

  /**
   * Create a new user
   */
  async createUser(payload: any) {
    const [res] = await this.db.insert(users).values(payload).$returningId();
    return res?.id;
  }

  /**
   * Update user profile
   */
  async updateUser(userId: number, patch: Partial<UserRow>) {
    await this.db.update(users).set(patch).where(eq(users.id, userId));
  }
}

export const authRepo = await AuthRepository.build();
