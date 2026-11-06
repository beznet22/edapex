import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  archiveObjectKey,
  ArchiveService,
  ArchiveIncompleteError,
  RestoreService,
  createService,
  createServiceContext
} from "../../src/lib/server/services";
import {
  countAssessmentRawRows,
  countClassAttendanceForSession,
  countStudentAttendanceForSession,
  listSessionJobs,
  selectAcademicYearById
} from "../../src/lib/server/repository";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { seedArchiveRows } from "../support/archive-fixture";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
  await seedArchiveRows(db, schools[0]);
  await seedArchiveRows(db, schools[1]);
});

const contextFor = (school: SeededSchool) =>
  createServiceContext(
    { DB: env.DB, MEDIA: env.MEDIA, ARCHIVE_TOKEN_SECRET: "test-secret" },
    tenantOf(school)
  );

describe("restore", () => {
  it("round-trips archive, purge and restore without losing rows", async () => {
    const ctx = contextFor(schools[0]);
    const archived = await createService(ArchiveService, ctx).start({
      sessionId: schools[0].academicId,
      purge: true,
      dryRun: false,
      actorId: schools[0].userId
    });
    if ("dryRun" in archived) throw new Error("expected an archive job");
    expect(archived.status).toBe("completed");

    await expect(
      countAssessmentRawRows(first, schools[0].academicId)
    ).resolves.toEqual({ marks: 0, results: 0, ratings: 0, remarks: 0 });
    await expect(
      countStudentAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(0);
    await expect(
      countClassAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(0);

    const restored = createService(RestoreService, ctx);
    const dry = await restored.start({
      sessionId: schools[0].academicId,
      dryRun: true,
      actorId: schools[0].userId
    });
    expect(dry).toMatchObject({
      dryRun: true,
      preflight: {
        students: 1,
        objects: 1,
        rows: {
          marks: 1,
          results: 1,
          ratings: 1,
          remarks: 1,
          studentAttendance: 2,
          classAttendance: 1,
          summaries: 1
        },
        gaps: []
      }
    });

    const started = await restored.start({
      sessionId: schools[0].academicId,
      dryRun: false,
      actorId: schools[0].userId
    });
    if ("dryRun" in started) throw new Error("expected a restore job");
    expect(started.status).toBe("completed");
    expect(started.progress?.restoredRows).toMatchObject({
      marks: 1,
      results: 1,
      ratings: 1,
      remarks: 1,
      studentAttendance: 2,
      classAttendance: 1,
      summaries: 1
    });

    await expect(
      countAssessmentRawRows(first, schools[0].academicId)
    ).resolves.toEqual({ marks: 1, results: 1, ratings: 1, remarks: 1 });
    await expect(
      countStudentAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(2);
    await expect(
      countClassAttendanceForSession(first, schools[0].academicId)
    ).resolves.toBe(1);
    await expect(
      selectAcademicYearById(first, schools[0].academicId)
    ).resolves.toMatchObject({ status: "archived_readable" });

    await expect(
      restored.start({
        sessionId: schools[0].academicId,
        dryRun: false,
        actorId: schools[0].userId
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("aborts before touching live tables when an object is missing", async () => {
    const ctx = contextFor(schools[1]);
    const archived = await createService(ArchiveService, ctx).start({
      sessionId: schools[1].academicId,
      purge: false,
      dryRun: false,
      actorId: schools[1].userId
    });
    if ("dryRun" in archived) throw new Error("expected an archive job");
    expect(archived.status).toBe("completed");

    const key = archiveObjectKey({
      schoolId: schools[1].schoolId,
      sessionId: schools[1].academicId,
      studentId: schools[1].studentId,
      version: 1
    });
    await env.MEDIA.delete(key);

    await expect(
      createService(RestoreService, ctx).start({
        sessionId: schools[1].academicId,
        dryRun: false,
        actorId: schools[1].userId
      })
    ).rejects.toBeInstanceOf(ArchiveIncompleteError);

    await expect(
      countAssessmentRawRows(second, schools[1].academicId)
    ).resolves.toEqual({ marks: 1, results: 1, ratings: 1, remarks: 1 });
    await expect(
      selectAcademicYearById(second, schools[1].academicId)
    ).resolves.toMatchObject({ status: "archived" });
    const jobs = await listSessionJobs(second, { kind: "restore", limit: 5 });
    expect(jobs[0]?.status).toBe("failed");
  });
});
