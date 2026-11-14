import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  countArchiveObjectsForSession,
  findArchiveObjectByKey,
  findSessionJob,
  listSessionJobs,
  listSessionSummariesForStudent,
  selectAcademicYearById
} from "../../src/lib/server/repository";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  ArchiveService,
  archiveObjectKey,
  createArchiveStore,
  createService,
  createServiceContext,
  decodeArchiveDocument,
  type ArchiveStorePort
} from "../../src/lib/server/services";
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

const serviceFor = (school: SeededSchool, ports?: Partial<{ archiveStore: ArchiveStorePort }>) =>
  createService(
    ArchiveService,
    createServiceContext(
      { DB: env.DB, MEDIA: env.MEDIA },
      tenantOf(school),
      ports === undefined ? {} : { ports }
    )
  );

describe("archive job", () => {
  it("dry-runs without writing and then archives the student-session", async () => {
    const service = serviceFor(schools[0]);
    const dry = await service.start({
      sessionId: schools[0].academicId,
      purge: false,
      dryRun: true,
      actorId: schools[0].userId
    });
    expect(dry).toMatchObject({
      dryRun: true,
      students: 1,
      rows: {
        marks: 1,
        results: 1,
        ratings: 1,
        remarks: 1,
        studentAttendance: 2,
        classAttendance: 1,
        summaries: 0
      },
      objects: { total: 0, quarantined: 0, bytes: 0 }
    });
    await expect(listSessionJobs(first, { kind: "archive", limit: 10 })).resolves.toEqual([]);

    const started = await service.start({
      sessionId: schools[0].academicId,
      purge: false,
      dryRun: false,
      actorId: schools[0].userId
    });
    if ("dryRun" in started) throw new Error("expected an archive job");
    expect(started.status).toBe("completed");
    expect(started.progress).toMatchObject({ objectsWritten: 1, quarantined: 0 });

    const key = archiveObjectKey({
      schoolId: schools[0].schoolId,
      sessionId: schools[0].academicId,
      studentId: schools[0].studentId,
      version: 1
    });
    const object = await env.MEDIA.get(key);
    expect(object).not.toBeNull();
    if (object === null) throw new Error("archive object was not written");
    const decoded = await decodeArchiveDocument(
      new Uint8Array(await object.arrayBuffer())
    );
    expect(decoded.kind).toBe("ok");
    if (decoded.kind === "ok") {
      expect(decoded.document.meta).toMatchObject({
        schoolId: schools[0].schoolId,
        sessionId: schools[0].academicId,
        studentId: schools[0].studentId
      });
      expect(Object.keys(decoded.document.terms)).toEqual([String(schools[0].termId)]);
      expect(decoded.document.raw.marks).toHaveLength(1);
      expect(decoded.document.raw.studentAttendance).toHaveLength(2);
    }

    await expect(findArchiveObjectByKey(first, key)).resolves.toMatchObject({
      status: "archived",
      schemaVersion: 1,
      version: 1
    });
    await expect(
      listSessionSummariesForStudent(first, {
        academicId: schools[0].academicId,
        studentId: schools[0].studentId
      })
    ).resolves.toHaveLength(1);
    await expect(
      selectAcademicYearById(first, schools[0].academicId)
    ).resolves.toMatchObject({ status: "archived" });
    await expect(findSessionJob(first, started.id)).resolves.toMatchObject({
      status: "completed"
    });

    const manifest = await service.manifest(schools[0].academicId);
    expect(manifest.students).toMatchObject({ total: 1, archived: 1, missing: [] });
    const status = await service.status(schools[0].academicId);
    expect(status.status).toBe("archived");
    expect(status.objects).toEqual({ total: 1, quarantined: 0, bytes: expect.any(Number) });
    expect(status.summaries).toBe(1);

    const again = await service.start({
      sessionId: schools[0].academicId,
      purge: false,
      dryRun: false,
      actorId: schools[0].userId
    });
    if ("dryRun" in again) throw new Error("expected an archive job");
    expect(again.status).toBe("completed");
    expect(again.progress?.objectsWritten).toBe(0);
    await expect(
      countArchiveObjectsForSession(first, schools[0].academicId)
    ).resolves.toBe(1);
  });

  it("quarantines a checksum mismatch and finishes the job", async () => {
    const real = createArchiveStore(env.MEDIA);
    const corrupt: ArchiveStorePort = {
      put: (key, bytes) => real.put(key, bytes),
      get: async (key) => {
        const bytes = await real.get(key);
        if (bytes !== null && key.endsWith(".json") && !key.endsWith("manifest.json")) {
          return new Uint8Array([0, 1, 2, 3]);
        }
        return bytes;
      },
      delete: (key) => real.delete(key),
      list: (prefix) => real.list(prefix)
    };
    const service = serviceFor(schools[1], { archiveStore: corrupt });
    const started = await service.start({
      sessionId: schools[1].academicId,
      purge: false,
      dryRun: false,
      actorId: schools[1].userId
    });
    if ("dryRun" in started) throw new Error("expected an archive job");
    expect(started.status).toBe("completed");
    expect(started.progress).toMatchObject({ objectsWritten: 0, quarantined: 1 });

    const key = archiveObjectKey({
      schoolId: schools[1].schoolId,
      sessionId: schools[1].academicId,
      studentId: schools[1].studentId,
      version: 1
    });
    await expect(findArchiveObjectByKey(second, key)).resolves.toMatchObject({
      status: "quarantined"
    });
    const manifest = await service.manifest(schools[1].academicId);
    expect(manifest.gaps).toContainEqual({
      studentId: schools[1].studentId,
      reason: "checksum_mismatch"
    });
  });

  it("keeps archive indexes and objects tenant-scoped", async () => {
    const key = archiveObjectKey({
      schoolId: schools[0].schoolId,
      sessionId: schools[0].academicId,
      studentId: schools[0].studentId,
      version: 1
    });
    await expect(findArchiveObjectByKey(second, key)).resolves.toBeNull();
    await expect(
      countArchiveObjectsForSession(second, schools[0].academicId)
    ).resolves.toBe(0);
  });
});
