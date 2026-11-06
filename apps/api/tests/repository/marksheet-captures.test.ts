import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  createCapture,
  findCaptureByFile,
  findCaptureById,
  findCaptureForStudentExam,
  listCapturesForClassExam,
  updateCapture
} from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

const captureBase = (school: SeededSchool, now: number) => ({
  classId: school.classId,
  sectionId: school.sectionId,
  academicId: school.academicId,
  examTypeId: school.termId,
  studentId: null,
  fileName: "sheet.jpg",
  uploadedBy: school.userId,
  status: "needs_review" as const,
  matchMethod: null,
  matchScore: null,
  matchCandidatesJson: null,
  ocrName: "TEST STUDENT",
  ocrAdmissionNo: null,
  ocrClassLabel: "1C",
  ocrTerm: "THIRD TERM",
  ocrCategory: "NURSERY",
  validationJson: null,
  createdAt: now,
  updatedAt: now
});

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
});

describe("marksheet capture repository", () => {
  it("creates an unbound capture and reads it back by id and file", async () => {
    const now = 1_700_000_000;
    const created = await createCapture(first, {
      ...captureBase(schools[0], now),
      id: "capture-1",
      ocrContentSha256: "hash-capture-1",
      ocrParserVersion: "v1"
    });

    expect(created.id).toBe("capture-1");
    expect(created.schoolId).toBe(schools[0].schoolId);
    expect(created.studentId).toBeNull();
    expect(created.status).toBe("needs_review");

    await expect(findCaptureById(first, "capture-1")).resolves.toMatchObject({
      id: "capture-1",
      ocrName: "TEST STUDENT"
    });
    await expect(
      findCaptureByFile(first, {
        classId: schools[0].classId,
        sectionId: schools[0].sectionId,
        examTypeId: schools[0].termId,
        contentSha256: "hash-capture-1",
        parserVersion: "v1"
      })
    ).resolves.toMatchObject({ id: "capture-1" });
  });

  it("lists captures for the class and exam, tenant-scoped", async () => {
    const now = 1_700_000_000;
    await createCapture(first, {
      ...captureBase(schools[0], now),
      id: "capture-2",
      ocrContentSha256: "hash-capture-2",
      ocrParserVersion: "v1"
    });

    const captures = await listCapturesForClassExam(
      first,
      schools[0].classId,
      schools[0].sectionId,
      schools[0].termId
    );
    expect(captures.map((capture) => capture.id).sort()).toEqual(["capture-1", "capture-2"]);

    await expect(
      findCaptureById(second, "capture-1")
    ).resolves.toBeNull();
  });

  it("confirms a capture for a student and finds it by student and exam", async () => {
    const now = 1_700_000_100;
    const updated = await updateCapture(
      first,
      "capture-1",
      {
        studentId: schools[0].studentId,
        status: "confirmed",
        matchMethod: "manual",
        confirmedBy: schools[0].userId,
        confirmedAt: now
      },
      now
    );

    expect(updated).toMatchObject({
      id: "capture-1",
      studentId: schools[0].studentId,
      status: "confirmed",
      matchMethod: "manual"
    });
    await expect(
      findCaptureForStudentExam(first, schools[0].studentId, schools[0].termId)
    ).resolves.toMatchObject({ id: "capture-1" });
  });

  it("rejects a second capture for the same student and exam", async () => {
    const now = 1_700_000_200;
    await expect(
      createCapture(first, {
        ...captureBase(schools[0], now),
        id: "capture-duplicate-student",
        ocrContentSha256: "hash-capture-3",
        ocrParserVersion: "v1",
        studentId: schools[0].studentId,
        status: "confirmed"
      })
    ).rejects.toThrow();
  });

  it("rejects a duplicate file capture for the same class and exam", async () => {
    const now = 1_700_000_300;
    await expect(
      createCapture(first, {
        ...captureBase(schools[0], now),
        id: "capture-duplicate-file",
        ocrContentSha256: "hash-capture-1",
        ocrParserVersion: "v1"
      })
    ).rejects.toThrow();
  });

  it("returns null when a capture id belongs to another tenant", async () => {
    await expect(findCaptureById(second, "capture-2")).resolves.toBeNull();
    await expect(
      findCaptureByFile(second, {
        classId: schools[0].classId,
        sectionId: schools[0].sectionId,
        examTypeId: schools[0].termId,
        contentSha256: "hash-capture-2",
        parserVersion: "v1"
      })
    ).resolves.toBeNull();
  });
});
