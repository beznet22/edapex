import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createUnscopedContext } from "../../src/lib/server/repository/base/repository-context";
import type { UnscopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  createSession,
  createUser,
  deleteAllUserSessions,
  deleteSession,
  findIdentity,
  findIdentitiesByUserId,
  findRoleById,
  findSessionById,
  findStaffByUserId,
  findUser,
  findUserByEmail,
  findUserById,
  listActiveRoles,
  linkIdentity,
  updateUser,
  updateUserClaimDigest,
  validateSession
} from "../../src/lib/server/repository";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let ctx: UnscopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  ctx = createUnscopedContext(env);
});

describe("user lookups", () => {
  it("finds users across schools because login runs before a tenant exists", async () => {
    const first = await findUserByEmail(ctx, "user1@example.test");
    const second = await findUserByEmail(ctx, "user2@example.test");
    expect(first?.id).toBe(schools[0].userId);
    expect(second?.id).toBe(schools[1].userId);
  });

  it("supports the legacy field dispatcher without loose typing", async () => {
    await expect(findUser(ctx, "id", schools[0].userId)).resolves.toMatchObject({
      id: schools[0].userId
    });
    await expect(findUser(ctx, "email", "user2@example.test")).resolves.toMatchObject({
      id: schools[1].userId
    });
    await expect(findUser(ctx, "id", "not-a-number")).resolves.toBeNull();
    await expect(findUser(ctx, "email", 42)).resolves.toBeNull();
  });

  it("returns null for an unknown user", async () => {
    await expect(findUserById(ctx, 999_999)).resolves.toBeNull();
    await expect(findUserByEmail(ctx, "nobody@example.test")).resolves.toBeNull();
  });
});

describe("user writes", () => {
  it("creates and updates a user without exposing mass assignment", async () => {
    const id = await createUser(ctx, {
      fullName: "Created User",
      email: "created@example.test",
      schoolId: schools[0].schoolId
    });
    expect(id).toBeGreaterThan(0);

    await updateUser(ctx, id, { fullName: "Renamed User", email: "renamed@example.test" });
    await expect(findUserByEmail(ctx, "renamed@example.test")).resolves.toMatchObject({
      id,
      fullName: "Renamed User"
    });
  });

  it("stores the shared claim digest on the password column", async () => {
    await updateUserClaimDigest(ctx, schools[0].userId, "shared-digest");
    const user = await findUserById(ctx, schools[0].userId);
    expect(user?.password).toBe("shared-digest");
  });
});

describe("roles and staff persona", () => {
  it("finds a role by id and lists a school's active roles", async () => {
    await expect(findRoleById(ctx, schools[0].roleId)).resolves.toMatchObject({
      id: schools[0].roleId,
      name: "Teacher"
    });
    const roles = await listActiveRoles(ctx, schools[0].schoolId);
    expect(roles.map((role) => role.id)).toEqual([schools[0].roleId]);
  });

  it("resolves the staff persona for a user across schools", async () => {
    await expect(findStaffByUserId(ctx, schools[1].userId)).resolves.toMatchObject({
      id: schools[1].staffId
    });
  });
});

describe("sessions", () => {
  const now = Math.floor(Date.now() / 1000);

  it("validates a live session, including the device binding", async () => {
    await createSession(ctx, {
      id: "session-1",
      userId: schools[0].userId,
      tokenHash: "token-1",
      expiresAt: now + 3600,
      deviceFingerprint: "device-1",
      createdAt: now
    });

    await expect(validateSession(ctx, "token-1", "device-1", now)).resolves.toMatchObject({
      session: { id: "session-1" },
      user: { id: schools[0].userId }
    });
    await expect(findSessionById(ctx, "session-1")).resolves.toMatchObject({
      session: { id: "session-1" }
    });
  });

  it("revokes the session when the device fingerprint changes", async () => {
    await expect(validateSession(ctx, "token-1", "other-device", now)).resolves.toBeNull();
    await expect(findSessionById(ctx, "session-1")).resolves.toBeNull();
  });

  it("rejects expired and revoked sessions", async () => {
    await createSession(ctx, {
      id: "session-2",
      userId: schools[0].userId,
      tokenHash: "token-2",
      expiresAt: now - 1,
      deviceFingerprint: "device-1",
      createdAt: now - 10
    });
    await expect(validateSession(ctx, "token-2", "device-1", now)).resolves.toBeNull();

    await createSession(ctx, {
      id: "session-3",
      userId: schools[0].userId,
      tokenHash: "token-3",
      expiresAt: now + 3600,
      deviceFingerprint: "device-1",
      createdAt: now
    });
    await deleteSession(ctx, "session-3");
    await expect(validateSession(ctx, "token-3", "device-1", now)).resolves.toBeNull();
  });

  it("deletes every session for a user", async () => {
    await createSession(ctx, {
      id: "session-4",
      userId: schools[1].userId,
      tokenHash: "token-4",
      expiresAt: now + 3600,
      deviceFingerprint: "device-2",
      createdAt: now
    });
    await deleteAllUserSessions(ctx, schools[1].userId);
    await expect(findSessionById(ctx, "session-4")).resolves.toBeNull();
  });
});

describe("identities", () => {
  it("links and finds a provider identity by its provider key", async () => {
    await linkIdentity(ctx, {
      id: "identity-1",
      userId: schools[0].userId,
      provider: "google",
      providerUserId: "google-123",
      emailAtProvider: "user1@example.test",
      emailVerified: 1,
      createdAt: Math.floor(Date.now() / 1000)
    });

    await expect(findIdentity(ctx, "google", "google-123")).resolves.toMatchObject({
      id: "identity-1"
    });
    await expect(findIdentity(ctx, "google", "other")).resolves.toBeNull();
    const identities = await findIdentitiesByUserId(ctx, schools[0].userId);
    expect(identities.map((identity) => identity.id)).toEqual(["identity-1"]);
  });
});
