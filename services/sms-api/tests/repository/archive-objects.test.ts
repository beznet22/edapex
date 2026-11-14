import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { archiveObjects, smAcademicYears } from "../../src/lib/server/db/schema";
import {
  countArchiveObjectsForSession,
  deleteArchiveObjectsForSessions,
  findArchiveObjectByKey,
  findLatestArchiveObject,
  insertArchiveObject,
  listArchiveObjectVersions,
  listArchiveObjectsForSession,
  listArchiveObjectsForStudent,
  nextArchiveVersion,
  sumArchiveObjectBytesForSession,
  updateArchiveObjectStatus
} from "../../src/lib/server/repository";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const OTHER_SESSION_ID = 1003;
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
  await db.insert(smAcademicYears).values({
    id: OTHER_SESSION_ID,
    year: "2027/2028",
    title: "Later Session",
    startingDate: "2027-09-14",
    endingDate: "2028-07-10",
    schoolId: schools[0].schoolId,
    status: "active"
  });
});

const keyFor = (school: SeededSchool, version: number): string =>
  `schools/${school.schoolId}/sessions/${school.academicId}/students/${school.studentId}/v${version}.json`;

const row = (
  school: SeededSchool,
  overrides: Partial<typeof archiveObjects.$inferInsert> = {}
): typeof archiveObjects.$inferInsert => ({
  schoolId: school.schoolId,
  academicId: school.academicId,
  studentId: school.studentId,
  studentRecordId: school.recordId,
  examTypeId: 0,
  objectKey: keyFor(school, 1),
  checksum: "checksum-1",
  bytes: 100,
  schemaVersion: 1,
  version: 1,
  status: "archived",
  createdAt: 1_790_000_000,
  ...overrides
});

describe("archive objects repository", () => {
  it("stores versions and returns the latest matching status", async () => {
    await insertArchiveObject(first, row(schools[0]));
    await insertArchiveObject(
      first,
      row(schools[0], {
        version: 2,
        objectKey: keyFor(schools[0], 2),
        checksum: "checksum-2",
        bytes: 250,
        status: "published",
        examTypeId: schools[0].termId
      })
    );

    await expect(findArchiveObjectByKey(first, keyFor(schools[0], 1))).resolves.toMatchObject({
      version: 1,
      status: "archived"
    });
    await expect(
      findLatestArchiveObject(first, {
        academicId: schools[0].academicId,
        studentId: schools[0].studentId,
        examTypeId: schools[0].termId,
        statuses: ["published"] as const
      })
    ).resolves.toMatchObject({ version: 2, checksum: "checksum-2" });
    await expect(
      nextArchiveVersion(first, {
        academicId: schools[0].academicId,
        studentId: schools[0].studentId
      })
    ).resolves.toBe(3);
  });

  it("lists versions newest first and the session in student order", async () => {
    const versions = await listArchiveObjectVersions(first, {
      academicId: schools[0].academicId,
      studentId: schools[0].studentId,
      examTypeId: schools[0].termId,
      statuses: ["published"] as const
    });
    expect(versions.map((entry) => entry.version)).toEqual([2]);

    const session = await listArchiveObjectsForSession(first, {
      academicId: schools[0].academicId,
      limit: 10
    });
    expect(session).toHaveLength(2);
    await expect(
      listArchiveObjectsForStudent(first, {
        academicId: schools[0].academicId,
        studentId: schools[0].studentId
      })
    ).resolves.toHaveLength(2);
  });

  it("summarises counts and bytes for one session", async () => {
    await expect(
      countArchiveObjectsForSession(first, schools[0].academicId)
    ).resolves.toBe(2);
    await expect(
      sumArchiveObjectBytesForSession(first, schools[0].academicId)
    ).resolves.toBe(350);
  });

  it("updates status without touching object content", async () => {
    const stored = await findArchiveObjectByKey(first, keyFor(schools[0], 1));
    expect(stored).not.toBeNull();
    await updateArchiveObjectStatus(first, {
      id: stored?.id ?? 0,
      status: "superseded",
      publishedAt: 1_790_000_100,
      publishedBy: schools[0].userId,
      reason: "Correction"
    });
    await expect(findArchiveObjectByKey(first, keyFor(schools[0], 1))).resolves.toMatchObject({
      status: "superseded",
      checksum: "checksum-1",
      publishedAt: 1_790_000_100,
      publishedBy: schools[0].userId,
      reason: "Correction"
    });
  });

  it("keeps tenants isolated", async () => {
    await expect(findArchiveObjectByKey(second, keyFor(schools[0], 1))).resolves.toBeNull();
    await expect(
      countArchiveObjectsForSession(second, schools[0].academicId)
    ).resolves.toBe(0);
    await expect(
      listArchiveObjectsForStudent(second, {
        academicId: schools[0].academicId,
        studentId: schools[0].studentId
      })
    ).resolves.toEqual([]);
  });

  it("deletes only the requested session", async () => {
    await insertArchiveObject(
      first,
      row(schools[0], {
        academicId: OTHER_SESSION_ID,
        studentRecordId: null,
        objectKey: `schools/${schools[0].schoolId}/sessions/${OTHER_SESSION_ID}/students/${schools[0].studentId}/v1.json`
      })
    );
    await deleteArchiveObjectsForSessions(first, [schools[0].academicId]);
    await expect(
      countArchiveObjectsForSession(first, schools[0].academicId)
    ).resolves.toBe(0);
    await expect(countArchiveObjectsForSession(first, OTHER_SESSION_ID)).resolves.toBe(1);
  });
});
