import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  countSessionSummariesForSession,
  deleteSessionSummariesForSessions,
  listSessionSummariesForSession,
  listSessionSummariesForStudent,
  replaceSessionSummariesForStudent
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

const summary = (school: SeededSchool, total: number) => ({
  schoolId: school.schoolId,
  academicId: school.academicId,
  studentId: school.studentId,
  termId: school.termId,
  sequence: 1,
  total,
  average: total,
  grade: total >= 50 ? "B" : "E",
  gpa: 3,
  position: 1,
  subjectCount: 1,
  createdAt: 1_790_000_000
});

describe("session result summary repository", () => {
  it("replaces one student's summaries without duplicating rows", async () => {
    await replaceSessionSummariesForStudent(first, {
      academicId: schools[0].academicId,
      studentId: schools[0].studentId,
      rows: [summary(schools[0], 80)]
    });
    await replaceSessionSummariesForStudent(first, {
      academicId: schools[0].academicId,
      studentId: schools[0].studentId,
      rows: [summary(schools[0], 90)]
    });

    const rows = await listSessionSummariesForStudent(first, {
      academicId: schools[0].academicId,
      studentId: schools[0].studentId
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(90);
  });

  it("lists and counts one session", async () => {
    const rows = await listSessionSummariesForSession(first, schools[0].academicId);
    expect(rows).toHaveLength(1);
    await expect(
      countSessionSummariesForSession(first, schools[0].academicId)
    ).resolves.toBe(1);
  });

  it("keeps tenants isolated", async () => {
    await expect(
      listSessionSummariesForStudent(second, {
        academicId: schools[0].academicId,
        studentId: schools[0].studentId
      })
    ).resolves.toEqual([]);
    await expect(
      countSessionSummariesForSession(second, schools[0].academicId)
    ).resolves.toBe(0);
  });

  it("deletes summaries for the selected session only", async () => {
    await replaceSessionSummariesForStudent(second, {
      academicId: schools[1].academicId,
      studentId: schools[1].studentId,
      rows: [summary(schools[1], 70)]
    });
    await deleteSessionSummariesForSessions(first, [schools[0].academicId]);
    await expect(
      countSessionSummariesForSession(first, schools[0].academicId)
    ).resolves.toBe(0);
    await expect(
      countSessionSummariesForSession(second, schools[1].academicId)
    ).resolves.toBe(1);
  });
});
