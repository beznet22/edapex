import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { authSessions, users } from "../../src/lib/server/db/schema";
import type { EmailMessage } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { request, testApp } from "./support/http";

const db = database(env);
const sent: EmailMessage[] = [];
const app = testApp({
  email: {
    async send(message) {
      sent.push(message);
      return { messageId: `test-${sent.length}` };
    }
  }
});
let school: SeededSchool;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
});

const requestLink = async (email: string): Promise<Response> =>
  request(app, "/api/v1/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email })
  });

const tokenFrom = (message: EmailMessage): string => {
  const raw = message.data["url"];
  if (typeof raw !== "string") throw new Error("magic link email has no URL");
  const token = new URL(raw).searchParams.get("token");
  if (token === null) throw new Error("magic link URL has no token");
  return token;
};

describe("magic link", () => {
  it("issues a link, consumes it once and creates a session", async () => {
    const before = sent.length;
    const response = await requestLink("USER1@example.test");
    expect(response.status).toBe(202);
    expect(sent).toHaveLength(before + 1);

    const message = sent.at(-1);
    if (message === undefined) throw new Error("no magic link email");
    expect(message.template).toBe("magic_link");
    expect(message.to).toBe("user1@example.test");

    const token = tokenFrom(message);
    const duplicate = await requestLink("user1@example.test");
    expect(duplicate.status).toBe(202);
    expect(sent).toHaveLength(before + 1);

    const verify = await request(app, `/api/v1/auth/magic-link/verify?token=${token}`);
    expect(verify.status).toBe(302);
    expect(verify.headers.get("set-cookie")).toContain("__Host-edapex_session=");

    const sessions = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, school.userId));
    expect(sessions.length).toBeGreaterThan(0);

    const [user] = await db
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, school.userId));
    expect(user?.emailVerifiedAt).not.toBeNull();

    const reused = await request(app, `/api/v1/auth/magic-link/verify?token=${token}`);
    expect(reused.status).toBe(401);
  });

  it("returns 202 for an unknown email without sending", async () => {
    const before = sent.length;
    const response = await requestLink("unknown@example.test");
    expect(response.status).toBe(202);
    expect(sent).toHaveLength(before);
  });

  it("rejects an invalid or missing token", async () => {
    expect(
      (await request(app, "/api/v1/auth/magic-link/verify?token=not-a-token")).status
    ).toBe(401);
    expect((await request(app, "/api/v1/auth/magic-link/verify")).status).toBe(401);
  });
});
