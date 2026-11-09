import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authIdentities,
  smParents,
  smStaffs,
  users
} from "../../src/lib/server/db/schema";
import {
  ClaimLinkService,
  completeClaim,
  createService,
  createServiceContext
} from "../../src/lib/server/services";
import type { AuthConfigPort, GoogleProfile } from "../../src/lib/server/services";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const NOW = 1_800_000_000;
const clock = { now: () => NOW };
const config: AuthConfigPort = {
  claimEnabled: true,
  claimDigest: "a".repeat(64),
  claimLinkEnabled: true,
  cookieSecret: "claim-link-secret",
  googleConfigured: true,
  postLoginRedirect: "/",
  appOrigin: "https://app.example.test"
};

let school: SeededSchool;
let parentId: number;
let staffId: number;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  parentId = 1901;
  staffId = 1902;
  await db.insert(smParents).values({
    id: parentId,
    guardiansName: "Unlinked Parent",
    guardiansEmail: "unlinked-parent@example.test",
    userId: null,
    schoolId: school.schoolId,
    academicId: school.academicId
  });
  await db.insert(smStaffs).values({
    id: staffId,
    fullName: "Unlinked Staff",
    email: "unlinked-staff@example.test",
    userId: null,
    schoolId: school.schoolId,
    roleId: school.roleId,
    designationId: school.designationId,
    departmentId: school.departmentId,
    genderId: school.genderId
  });
});

const scoped = () =>
  createServiceContext({ DB: env.DB }, tenantOf(school), {
    ports: { clock, authConfig: config }
  });
const unscoped = () =>
  createServiceContext({ DB: env.DB }, null, {
    ports: { clock, authConfig: config }
  });

const tokenOf = (url: string): string => {
  const token = new URL(url).hash.replace(/^#token=/, "");
  if (token.length === 0) throw new Error("claim URL has no token");
  return token;
};

const googleProfile = (email: string, subject: string): GoogleProfile => ({
  providerUserId: subject,
  email,
  emailVerified: true,
  name: email
});

describe("admin claim links", () => {
  it("provisions an unlinked parent and completes claim with a new Google email", async () => {
    const admin = createService(ClaimLinkService, scoped());
    const created = await admin.create({
      subjectType: "parent",
      subjectId: parentId,
      ttlHours: 72,
      adminUserId: school.userId
    });
    expect(created.url).toMatch(/^https:\/\/app\.example\.test\/claim#token=/);

    const [parent] = await db
      .select({ userId: smParents.userId })
      .from(smParents)
      .where(eq(smParents.id, parentId));
    expect(parent?.userId).not.toBeNull();
    const userId = parent?.userId;
    if (userId === null || userId === undefined) throw new Error("parent was not provisioned");

    const publicService = createService(ClaimLinkService, unscoped());
    const exchanged = await publicService.exchange({
      token: tokenOf(created.url),
      ip: "198.51.100.10",
      userAgent: "vitest"
    });
    expect(exchanged.ticket.length).toBeGreaterThan(20);

    const claimed = await completeClaim(unscoped(), {
      userId,
      profile: googleProfile("new-parent@example.test", "google-parent-1"),
      allowEmailChange: true,
      claimLinkId: created.id,
      ip: "198.51.100.10",
      userAgent: "vitest",
      fingerprint: null
    });
    expect(claimed.user.email).toBe("new-parent@example.test");

    const [user] = await db
      .select({ email: users.email, password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, userId));
    expect(user).toEqual({
      email: "new-parent@example.test",
      password: null,
      claimStatus: "claimed"
    });

    const identities = await db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(eq(authIdentities.userId, userId));
    expect(identities).toHaveLength(1);
  });

  it("provisions an unlinked staff account with the same flow", async () => {
    const admin = createService(ClaimLinkService, scoped());
    const created = await admin.create({
      subjectType: "staff",
      subjectId: staffId,
      ttlHours: 24,
      adminUserId: school.userId
    });

    const [staff] = await db
      .select({ userId: smStaffs.userId })
      .from(smStaffs)
      .where(eq(smStaffs.id, staffId));
    expect(staff?.userId).not.toBeNull();
    expect(created.url).toContain("#token=");
  });
});
