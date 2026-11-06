import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { authSessions, users } from "../../db/schema";
import { batchOrThrow } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { UnscopedRepositoryContext } from "../base/repository-context";
import type { NewSession, SessionWithUser } from "./types";

export async function createSession(
  ctx: UnscopedRepositoryContext,
  session: NewSession
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.insert(authSessions).values(session);
    },
    "createSession"
  );
}

/**
 * Validates by token hash, not by a client-supplied session id. Expiry is unix
 * seconds (`O20`); revoked, expired, or inactive-user sessions yield null. A
 * device-binding mismatch revokes the session, preserving legacy behaviour.
 */
export async function validateSession(
  ctx: UnscopedRepositoryContext,
  tokenHash: string,
  currentFingerprint: string,
  now: number = Math.floor(Date.now() / 1000)
): Promise<SessionWithUser | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);

    if (row === undefined) return null;
    const { session, user } = row;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt <= now) return null;
    if (user.activeStatus !== 1) return null;

    if (session.deviceFingerprint !== currentFingerprint) {
      await ctx.db.delete(authSessions).where(eq(authSessions.id, session.id));
      return null;
    }
    return { session, user };
  }, "validateSession");
}

export async function findSessionById(
  ctx: UnscopedRepositoryContext,
  id: string
): Promise<SessionWithUser | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.id, id))
      .limit(1);
    return row ?? null;
  }, "findSessionById");
}

/** Hard delete, matching the legacy session store. */
export async function deleteSession(
  ctx: UnscopedRepositoryContext,
  id: string
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.delete(authSessions).where(eq(authSessions.id, id));
    },
    "deleteSession"
  );
}

export async function deleteAllUserSessions(
  ctx: UnscopedRepositoryContext,
  userId: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.delete(authSessions).where(eq(authSessions.userId, userId));
    },
    "deleteAllUserSessions"
  );
}

export async function revokeSessionByTokenHash(
  ctx: UnscopedRepositoryContext,
  tokenHash: string,
  revokedAt: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .update(authSessions)
        .set({ revokedAt })
        .where(eq(authSessions.tokenHash, tokenHash));
    },
    "revokeSessionByTokenHash"
  );
}

/** Refresh replaces the old token and inserts its successor atomically. */
export async function rotateSession(
  ctx: UnscopedRepositoryContext,
  oldTokenHash: string,
  session: NewSession
): Promise<void> {
  await withErrorHandling(
    async () => {
      const statements: BatchItem<"sqlite">[] = [
        ctx.db.delete(authSessions).where(eq(authSessions.tokenHash, oldTokenHash)),
        ctx.db.insert(authSessions).values(session)
      ];
      await batchOrThrow(ctx.db, statements);
    },
    "rotateSession"
  );
}
