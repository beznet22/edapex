import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authSessions } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { SessionService, issueSession } from "../../src/lib/server/services/auth";
import { AuthError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let ctx: ReturnType<typeof createServiceContext>;
let session: SessionService;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  ctx = createServiceContext({ DB: env.DB }, null);
  session = createService(SessionService, ctx);
});

describe("session service", () => {
  it("reads, rotates and revokes a session", async () => {
    const issued = await issueSession(ctx, school.userId, {
      ip: "10.2.0.1",
      userAgent: null,
      fingerprint: null
    });

    const view = await session.getSession(issued.token);
    expect(view?.user.id).toBe(school.userId);
    expect(view?.sessionId).toBeDefined();

    const refreshed = await session.refresh(issued.token);
    await expect(session.getSession(issued.token)).resolves.toBeNull();
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
    await issueSession(ctx, school.userId, {
      ip: "10.2.0.2",
      userAgent: null,
      fingerprint: null
    });
    await issueSession(ctx, school.userId, {
      ip: "10.2.0.3",
      userAgent: null,
      fingerprint: null
    });

    await session.logoutAll(school.userId);
    const rows = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, school.userId));
    expect(rows).toEqual([]);
  });

  it("keeps the mobile aliases wired to the same lifecycle", async () => {
    const issued = await issueSession(ctx, school.userId, {
      ip: "10.2.0.4",
      userAgent: null,
      fingerprint: null
    });
    const refreshed = await session.refreshMobile(issued.token);
    await session.logoutMobile(refreshed.token);
    await expect(session.getSession(refreshed.token)).resolves.toBeNull();
  });
});
