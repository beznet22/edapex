import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { authEvents, sessionJobs, users } from "../../src/lib/server/db/schema";
import {
  ArchiveService,
  JobService,
  WipeService,
  WipeApprovalError,
  createService,
  createServiceContext
} from "../../src/lib/server/services";
import {
  countArchiveObjectsForSession,
  countSessionSummariesForSession,
  findSessionJob,
  listSessionJobs
} from "../../src/lib/server/repository";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { seedArchiveRows } from "../support/archive-fixture";

const db = database(env);
const SECOND_ADMIN_ID = 104;
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  await seedArchiveRows(db, schools[0]);
  await db.insert(users).values({
    id: SECOND_ADMIN_ID,
    fullName: "Second Admin",
    email: "admin2@example.test",
    schoolId: schools[0].schoolId,
    roleId: schools[0].roleId,
    isAdministrator: "yes"
  });
});

const contextFor = (school: SeededSchool) =>
  createServiceContext(
    { DB: env.DB, MEDIA: env.MEDIA, ARCHIVE_TOKEN_SECRET: "test-secret" },
    tenantOf(school)
  );

const archiveFirstSchool = async (): Promise<void> => {
  const archived = await createService(ArchiveService, contextFor(schools[0])).start({
    sessionId: schools[0].academicId,
    purge: false,
    dryRun: false,
    actorId: schools[0].userId
  });
  if ("dryRun" in archived) throw new Error("expected an archive job");
  expect(archived.status).toBe("completed");
};

describe("dual-admin wipe", () => {
  it("blocks without the confirmation, without a token, and for the initiator", async () => {
    await archiveFirstSchool();
    const ctx = contextFor(schools[0]);
    const wipe = createService(WipeService, ctx);
    const request = await wipe.request({
      sessionIds: [schools[0].academicId],
      actorId: schools[0].userId
    });
    expect(request).toMatchObject({ objects: 1, summaries: 1 });
    await expect(
      countArchiveObjectsForSession(first, schools[0].academicId)
    ).resolves.toBe(1);

    await expect(
      wipe.execute({
        sessionIds: [schools[0].academicId],
        confirm: "WRONG",
        secondAdminToken: "nope",
        actorId: schools[0].userId + 1
      })
    ).rejects.toBeInstanceOf(WipeApprovalError);

    const approve = createService(JobService, ctx);
    await expect(
      approve.approve(request.jobId, schools[0].userId)
    ).rejects.toBeInstanceOf(WipeApprovalError);

    const approval = await approve.approve(request.jobId, schools[0].userId + 1);
    await expect(
      wipe.execute({
        sessionIds: [schools[0].academicId],
        confirm: "WIPE_ALL_ARCHIVES",
        secondAdminToken: "forged",
        actorId: schools[0].userId + 1
      })
    ).rejects.toBeInstanceOf(WipeApprovalError);

    await expect(
      wipe.execute({
        sessionIds: [schools[0].academicId],
        confirm: "WIPE_ALL_ARCHIVES",
        secondAdminToken: approval.token,
        actorId: schools[0].userId
      })
    ).rejects.toBeInstanceOf(WipeApprovalError);
  });

  it("executes once with a second admin's token and audits the wipe", async () => {
    const ctx = contextFor(schools[0]);
    const wipe = createService(WipeService, ctx);
    const jobs = await listSessionJobs(first, { kind: "wipe", limit: 5 });
    const pending = jobs[0];
    if (pending === undefined) throw new Error("expected a pending wipe job");

    const approval = await createService(JobService, ctx).approve(
      pending.id,
      SECOND_ADMIN_ID
    );
    const done = await wipe.execute({
      sessionIds: [schools[0].academicId],
      confirm: "WIPE_ALL_ARCHIVES",
      secondAdminToken: approval.token,
      actorId: SECOND_ADMIN_ID
    });
    expect(done.status).toBe("completed");
    await expect(
      countArchiveObjectsForSession(first, schools[0].academicId)
    ).resolves.toBe(0);
    await expect(
      countSessionSummariesForSession(first, schools[0].academicId)
    ).resolves.toBe(0);

    const audit = await db
      .select()
      .from(authEvents)
      .where(eq(authEvents.type, "archive_wipe"));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toContain(pending.id);

    await expect(
      wipe.execute({
        sessionIds: [schools[0].academicId],
        confirm: "WIPE_ALL_ARCHIVES",
        secondAdminToken: approval.token,
        actorId: SECOND_ADMIN_ID
      })
    ).rejects.toBeInstanceOf(WipeApprovalError);
    await expect(findSessionJob(first, pending.id)).resolves.toMatchObject({
      status: "completed"
    });
  });

  it("blocks a wipe while a restore is running", async () => {
    await db.insert(sessionJobs).values({
      id: "running-restore",
      schoolId: schools[1].schoolId,
      kind: "restore",
      academicId: schools[1].academicId,
      status: "running",
      createdBy: schools[1].userId,
      createdAt: 1_790_000_000
    });
    await expect(
      createService(WipeService, contextFor(schools[1])).request({
        sessionIds: [schools[1].academicId],
        actorId: schools[1].userId
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
