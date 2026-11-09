import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authSessions, users } from "../../src/lib/server/db/schema";
import { createServiceContext } from "../../src/lib/server/services/context";
import {
  ClaimService,
  constantTimeEqual,
  sha256Hex,
  signPayload
} from "../../src/lib/server/services";
import type { ServiceContext } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";

const db = database(env);
const NOW = 1_700_300_000;
const SECRET = "cpu-cookie-secret";
const SHARED = "cpu-shared-secret";
const EMAIL = "cpu@example.test";

let ctx: ServiceContext;
let digest: string;

const clock = { now: () => NOW };

beforeAll(async () => {
  await seedTwoSchools(db);
  digest = await sha256Hex(SHARED);
  await db
    .update(users)
    .set({ email: EMAIL, password: digest, claimStatus: "pending" })
    .where(eq(users.id, 102));
  ctx = createServiceContext(env, null, {
    ports: {
      clock,
      authConfig: {
        claimEnabled: true,
        claimDigest: digest,
        cookieSecret: SECRET,
        googleConfigured: true,
        postLoginRedirect: "/"
      }
    }
  });
});

describe("claim CPU budget", () => {
  it("keeps hash, digest comparison and cookie signing under 10 ms per attempt", async () => {
    const iterations = 200;

    await sha256Hex(SHARED);
    await signPayload(SECRET, { purpose: "claim", userId: 1 }, NOW + 600);

    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      const submitted = await sha256Hex(SHARED);
      constantTimeEqual(submitted, digest);
      await signPayload(SECRET, { purpose: "claim", userId: index }, NOW + 600);
    }
    const perAttempt = (performance.now() - started) / iterations;
    console.log(`claim crypto path: ${perAttempt.toFixed(4)} ms/attempt`);
    expect(perAttempt).toBeLessThan(10);
  });

  it("completes one end-to-end claim through D1", async () => {
    const started = performance.now();
    const ticket = await new ClaimService(ctx).request({
      email: EMAIL,
      password: SHARED,
      ip: "198.51.100.30",
      userAgent: "vitest"
    });
    if (ticket.ticket === null) throw new Error("expected a claim ticket");

    const result = await new ClaimService(ctx).complete({
      userId: 102,
      profile: {
        providerUserId: "google-cpu",
        email: EMAIL,
        emailVerified: true,
        name: null
      },
      ip: "198.51.100.30",
      userAgent: "vitest",
      fingerprint: null
    });
    const elapsed = performance.now() - started;
    console.log(`claim end-to-end (request + link + session): ${elapsed.toFixed(2)} ms`);
    expect(result.user.id).toBe(102);

    const [user] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 102));
    expect(user).toEqual({ password: null, claimStatus: "claimed" });

    const sessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, 102));
    expect(sessions).toHaveLength(1);
  });
});
