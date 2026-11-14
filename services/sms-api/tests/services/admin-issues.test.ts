import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { smParents } from "../../src/lib/server/db/schema";
import {
  AdminIssueService,
  CapabilityService,
  createService,
  createServiceContext
} from "../../src/lib/server/services";
import type { AuthConfigPort, AuthUser } from "../../src/lib/server/services";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const NOW = 1_800_000_000;
const clock = { now: () => NOW };
const config: AuthConfigPort = {
  claimEnabled: true,
  claimDigest: "a".repeat(64),
  claimLinkEnabled: true,
  cookieSecret: "admin-issue-secret",
  googleConfigured: true,
  postLoginRedirect: "/",
  appOrigin: "https://app.example.test"
};

let school: SeededSchool;
let parentId: number;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  parentId = 2901;
  await db.insert(smParents).values({
    id: parentId,
    guardiansName: "Unlinked Guardian",
    guardiansEmail: "guardian-issue@example.test",
    userId: null,
    schoolId: school.schoolId,
    academicId: school.academicId
  });
});

const scoped = () =>
  createServiceContext({ DB: env.DB }, tenantOf(school), {
    ports: { clock, authConfig: config }
  });

const teacher = (): AuthUser => ({
  id: school.userId,
  email: "teacher@example.test",
  username: null,
  fullName: "Teacher",
  schoolId: school.schoolId,
  roleId: school.roleId,
  staffId: school.staffId,
  designationId: school.designationId,
  isAdmin: false
});

describe("workspace capability manifest", () => {
  it("resolves a teacher manifest from the authenticated staff identity", async () => {
    const manifest = await createService(
      CapabilityService,
      scoped()
    ).manifestFor(teacher());
    expect(manifest.role).toBe("teacher");
    expect(manifest.packs[0]?.tools.map((tool) => tool.id)).toContain("workspace");
  });

  it("resolves an admin manifest without relying on client claims", async () => {
    const manifest = await createService(CapabilityService, scoped()).manifestFor({
      ...teacher(),
      staffId: null,
      isAdmin: true
    });
    expect(manifest.role).toBe("admin");
    expect(manifest.packs[0]?.tools.map((tool) => tool.id)).toContain("admin_issues");
  });
});

describe("admin issue plan and apply", () => {
  it("lists, plans and applies a claim-link action for an unlinked parent", async () => {
    const service = createService(AdminIssueService, scoped());
    const page = await service.list({
      type: "unlinked_parent",
      severity: "all",
      search: "Unlinked Guardian",
      page: 1,
      pageSize: 25
    });
    expect(page.total).toBe(1);
    const issue = page.items[0];
    if (issue === undefined) throw new Error("issue was not returned");
    expect(issue.id).toBe(`unlinked_parent:parent:${parentId}`);
    expect(issue.actions.map((action) => action.id)).toContain("create_claim_link");

    const plan = await service.plan(issue.id);
    expect(plan.version).toBe(1);

    const applied = await service.apply(
      issue.id,
      { actionId: "create_claim_link", ttlHours: 24, confirm: "apply" },
      school.userId
    );
    expect(applied.status).toBe("applied");
    expect(applied.claimLink?.url).toContain("https://app.example.test/claim#token=");

    const [parent] = await db
      .select({ userId: smParents.userId })
      .from(smParents)
      .where(eq(smParents.id, parentId));
    expect(parent?.userId).not.toBeNull();
  });

  it("returns not found for an unknown issue id", async () => {
    const service = createService(AdminIssueService, scoped());
    await expect(service.get("unlinked_parent:parent:999999")).rejects.toThrow();
  });
});
