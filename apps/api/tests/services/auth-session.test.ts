import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authSessions, users } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { AuthService, SessionService } from "../../src/lib/server/services/auth";
import { AuthError } from "../../src/lib/server/services/errors";
import { sha256Hex } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let auth: AuthService;
let session: SessionService;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  await db
    .update(users)
    .set({ password: await sha256Hex("secret") })
    .where(eq(users.id, school.userId));

  const ctx = createServiceContext({ DB: env.DB }, null);
  auth = createService(AuthService, ctx);
  session = createService(SessionService, ctx);
});

describe("session service", () => {
  it("reads, rotates and revokes a session", async () => {
    const login = await auth.login({
      identifier: "user1@example.test",
      password: "secret",
      ip: "10.2.0.1"
    });

    const view = await session.getSession(login.token);
    expect(view?.user.id).toBe(school.userId);
    expect(view?.sessionId).toBeDefined();

    const refreshed = await session.refresh(login.token);
    await expect(session.getSession(login.token)).resolves.toBeNull();
    await expect(session.getSession(refreshed.token)).resolves.not.toBeNull();

    await session.logout(refreshed.token);
    await expect(session.getSession(refreshed.token)).resolves.toBeNull();
  });

  it("rejects an unknown or empty token", async () => {
    await expect(session.getSession("not-a-token")).resolves.toBeNull();
    await expect(session.getSession("")).resolves.toBeNull();
    await expect(session.refresh("not-a-token")).rejects.toBeInstanceOf(AuthError);
  });

  it("logs out every session for a user", async () => {
    await auth.login({
      identifier: "user1@example.test",
      password: "secret",
      ip: "10.2.0.2"
    });
    await auth.login({
      identifier: "user1@example.test",
      password: "secret",
      ip: "10.2.0.3"
    });

    await session.logoutAll(school.userId);
    const rows = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, school.userId));
    expect(rows).toEqual([]);
  });

  it("keeps the mobile aliases wired to the same lifecycle", async () => {
    const login = await auth.login({
      identifier: "user1@example.test",
      password: "secret",
      ip: "10.2.0.4"
    });
    const refreshed = await session.refreshMobile(login.token);
    await session.logoutMobile(refreshed.token);
    await expect(session.getSession(refreshed.token)).resolves.toBeNull();
  });
});
