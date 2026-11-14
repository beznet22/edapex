import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  consumeSessionJobApproval,
  findActiveJobForSession,
  findActiveWipeJob,
  findRunningRestoreJob,
  findSessionJob,
  finishSessionJob,
  insertSessionJob,
  listSessionJobs,
  setSessionJobApproval,
  updateSessionJobProgress
} from "../../src/lib/server/repository";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
});

const job = (school: SeededSchool, id: string, kind: "archive" | "restore" | "wipe") => ({
  id,
  schoolId: school.schoolId,
  kind,
  academicId: kind === "wipe" ? null : school.academicId,
  status: "queued" as const,
  createdBy: school.userId,
  createdAt: 1_790_000_000
});

describe("session jobs repository", () => {
  it("stores a job, exposes it by id and filters the list", async () => {
    await insertSessionJob(first, job(schools[0], "job-archive-1", "archive"));
    await expect(findSessionJob(first, "job-archive-1")).resolves.toMatchObject({
      kind: "archive",
      status: "queued",
      createdBy: schools[0].userId
    });
    await expect(
      listSessionJobs(first, { kind: "archive", limit: 10 })
    ).resolves.toHaveLength(1);
    await expect(
      listSessionJobs(first, { status: "completed", limit: 10 })
    ).resolves.toEqual([]);
  });

  it("checkpoints progress and finishes with a result", async () => {
    await updateSessionJobProgress(first, "job-archive-1", {
      progressJson: JSON.stringify({ processedStudents: 5, totalStudents: 10 }),
      status: "running",
      updatedAt: 1_790_000_050
    });
    await expect(findSessionJob(first, "job-archive-1")).resolves.toMatchObject({
      status: "running",
      progressJson: JSON.stringify({ processedStudents: 5, totalStudents: 10 })
    });

    await finishSessionJob(first, "job-archive-1", {
      status: "completed",
      resultJson: JSON.stringify({ objects: 10 }),
      finishedAt: 1_790_000_100
    });
    await expect(findSessionJob(first, "job-archive-1")).resolves.toMatchObject({
      status: "completed",
      resultJson: JSON.stringify({ objects: 10 }),
      finishedAt: 1_790_000_100
    });
  });

  it("records a second-admin approval and consumes it once", async () => {
    await insertSessionJob(first, job(schools[0], "job-wipe-1", "wipe"));
    await setSessionJobApproval(first, "job-wipe-1", {
      approvedBy: schools[0].userId + 1,
      tokenHash: "hash-1",
      expiresAt: 1_790_000_300,
      updatedAt: 1_790_000_200
    });
    await expect(findSessionJob(first, "job-wipe-1")).resolves.toMatchObject({
      status: "awaiting_approval",
      approvedBy: schools[0].userId + 1,
      approvalTokenHash: "hash-1",
      approvalConsumedAt: null
    });
    await consumeSessionJobApproval(first, "job-wipe-1", 1_790_000_250);
    await expect(findSessionJob(first, "job-wipe-1")).resolves.toMatchObject({
      approvalConsumedAt: 1_790_000_250
    });
  });

  it("finds active session jobs, running restores and active wipes", async () => {
    await insertSessionJob(first, job(schools[0], "job-restore-1", "restore"));
    await updateSessionJobProgress(first, "job-restore-1", {
      status: "running",
      updatedAt: 1_790_000_300
    });
    await expect(findRunningRestoreJob(first)).resolves.toMatchObject({
      id: "job-restore-1"
    });
    await expect(
      findActiveJobForSession(first, {
        academicId: schools[0].academicId,
        kinds: ["restore"]
      })
    ).resolves.toMatchObject({ id: "job-restore-1" });
    await expect(findActiveWipeJob(first)).resolves.toMatchObject({ id: "job-wipe-1" });
  });

  it("keeps tenants isolated", async () => {
    await expect(findSessionJob(second, "job-archive-1")).resolves.toBeNull();
    await expect(listSessionJobs(second, { limit: 10 })).resolves.toEqual([]);
    await expect(findRunningRestoreJob(second)).resolves.toBeNull();
  });
});
