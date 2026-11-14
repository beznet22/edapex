/**
 * Rehearsal-only session minting.
 *
 * The Workers suite never sees this path: it is a local CLI helper that inserts
 * an opaque session row directly into the scratch D1 so a rehearsal can call
 * authenticated routes. It refuses to run unless `local === true`.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { executeSql, queryJson } from "./load.mjs";

export const SESSION_COOKIE = "__Host-edapex_session";

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function mintSession(persist, userId, local) {
  if (local !== true) {
    throw new Error("Refusing to mint a session without --local");
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("A positive user id is required");
  }
  const users = queryJson(
    persist,
    `SELECT id FROM users WHERE id = ${userId} AND active_status = 1;`
  );
  if (users.length === 0) {
    throw new Error(`No active user ${userId} exists in the scratch database`);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(token);
  const sessionId = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 60 * 60;
  executeSql(
    persist,
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, device_fingerprint, created_at, last_seen_at, revoked_at)
     VALUES ('${sessionId}', ${userId}, '${tokenHash}', ${expiresAt}, NULL, ${now}, ${now}, NULL);`
  );

  return {
    token,
    tokenHash,
    userId,
    sessionId,
    expiresAt,
    cookie: `${SESSION_COOKIE}=${token}`
  };
}

export function mintAdminSession(persist, local) {
  if (local !== true) {
    throw new Error("Refusing to mint a session without --local");
  }
  const admins = queryJson(
    persist,
    "SELECT id FROM users WHERE is_administrator = 'yes' AND active_status = 1 ORDER BY id LIMIT 1;"
  );
  const userId = Number(admins[0]?.id ?? 0);
  if (userId <= 0) throw new Error("No active administrator exists in the scratch database");
  return mintSession(persist, userId, local);
}
