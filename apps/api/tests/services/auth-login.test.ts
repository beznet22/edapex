import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authEvents, authSessions, users } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { AuthService } from "../../src/lib/server/services/auth";
import {
  AmbiguousEmailError,
  AuthError,
  RateLimitError
} from "../../src/lib/server/services/errors";
import { sha256Hex } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let service: AuthService;
let digest: string;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  digest = await sha256Hex("secret");

  await db
    .update(users)
    .set({ password: digest, isAdministrator: "no" })
    .where(eq(users.id, school.userId));

  await db.insert(users).values([
    {
      id: 9001,
      fullName: "Duplicate One",
      email: "dup@example.test",
      password: digest,
      activeStatus: 1,
      schoolId: school.schoolId
    },
    {
      id: 9002,
      fullName: "Duplicate Two",
      email: "dup@example.test",
      password: digest,
      activeStatus: 1,
      schoolId: school.schoolId
    },
    {
      id: 9003,
      fullName: "Rate Limited",
      email: "ratelimit@example.test",
      password: digest,
      activeStatus: 1,
      schoolId: school.schoolId
    }
  ]);

  service = createService(
    AuthService,
    createServiceContext({ DB: env.DB }, null)
  );
});

describe("auth login", () => {
  it("issues an opaque session for a correct digest and records success", async () => {
    const result = await service.login({
      identifier: "user1@example.test",
      password: "secret",
      ip: "10.1.0.1",
      fingerprint: "fp-1"
    });

    expect(result.user.id).toBe(school.userId);
    expect(result.token).toHaveLength(64);
    expect(result.user.staffId).toBe(school.staffId);

    const sessions = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, school.userId));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(await sha256Hex(result.token));
    expect(sessions[0]?.deviceFingerprint).toBe("fp-1");

    const events = await db
      .select()
      .from(authEvents)
      .where(eq(authEvents.type, "login_succeeded"));
    expect(events.some((event) => event.userId === school.userId)).toBe(true);
  });

  it("rejects a wrong password with a generic error and records the attempt", async () => {
    await expect(
      service.login({
        identifier: "user1@example.test",
        password: "wrong",
        ip: "10.1.0.2"
      })
    ).rejects.toBeInstanceOf(AuthError);

    const events = await db
      .select()
      .from(authEvents)
      .where(eq(authEvents.type, "login_failed"));
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects an ambiguous duplicate email before checking the password", async () => {
    await expect(
      service.login({
        identifier: "dup@example.test",
        password: "secret",
        ip: "10.1.0.3"
      })
    ).rejects.toBeInstanceOf(AmbiguousEmailError);
  });

  it("locks out after five failures in the window", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.login({
          identifier: "ratelimit@example.test",
          password: "wrong",
          ip: "10.1.0.4"
        })
      ).rejects.toBeInstanceOf(AuthError);
    }

    await expect(
      service.login({
        identifier: "ratelimit@example.test",
        password: "wrong",
        ip: "10.1.0.4"
      })
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("does not reveal an unknown account", async () => {
    await expect(
      service.login({
        identifier: "unknown@example.test",
        password: "secret",
        ip: "10.1.0.5"
      })
    ).rejects.toBeInstanceOf(AuthError);
  });
});
