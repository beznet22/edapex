import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  gradeChangeAudit,
  publicDocumentTokens,
  smAcademicYears,
  smExamTypes,
  smParents,
  users
} from "../../src/lib/server/db/schema";
import { findResultById, selectAcademicYearById } from "../../src/lib/server/repository";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  ArchiveService,
  AttendanceService,
  ConflictError,
  NotFoundError,
  PublicDocumentService,
  ReportCardService,
  RetrievalService,
  SessionReadOnlyError,
  createService,
  createServiceContext
} from "../../src/lib/server/services";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { seedArchiveRows } from "../support/archive-fixture";

const db = database(env);
const PARENT_USER_ID = 105;
let schools: readonly [SeededSchool, SeededSchool];
let repo: ScopedRepositoryContext;

const resultId = (school: SeededSchool): number => school.schoolId * 1000 + 2;

const scopedContext = (school: SeededSchool) =>
  createServiceContext(
    { DB: env.DB, MEDIA: env.MEDIA, ARCHIVE_TOKEN_SECRET: "test-secret" },
    tenantOf(school)
  );

const baseContext = () =>
  createServiceContext(
    { DB: env.DB, MEDIA: env.MEDIA, ARCHIVE_TOKEN_SECRET: "test-secret" },
    null
  );

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  repo = createRepositoryContext(db, tenantOf(schools[0]));
  await seedArchiveRows(db, schools[0]);
  await db.insert(users).values({
    id: PARENT_USER_ID,
    fullName: "Parent User",
    email: "parent-user@example.test",
    schoolId: schools[0].schoolId,
    roleId: schools[0].roleId
  });
  await db
    .update(smParents)
    .set({ userId: PARENT_USER_ID })
    .where(eq(smParents.id, schools[0].parentId));
});

describe("report card lifecycle and retrieval", () => {
  it("reviews, publishes and serves staff and parent views", async () => {
    const ctx = scopedContext(schools[0]);
    const cards = createService(ReportCardService, ctx);
    const reviewed = await cards.review({
      studentId: schools[0].studentId,
      examTypeId: schools[0].termId,
      actorId: schools[0].userId
    });
    expect(reviewed).toMatchObject({ version: 1, status: "reviewed", publishedAt: null });

    const published = await cards.publish({
      studentId: schools[0].studentId,
      examTypeId: schools[0].termId,
      actorId: schools[0].userId
    });
    expect(published).toMatchObject({ version: 1, status: "published" });
    expect(published.publishedAt).not.toBeNull();

    const archived = await createService(ArchiveService, ctx).start({
      sessionId: schools[0].academicId,
      purge: false,
      dryRun: false,
      actorId: schools[0].userId
    });
    if ("dryRun" in archived) throw new Error("expected an archive job");
    expect(archived.status).toBe("completed");

    const staffView = await createService(RetrievalService, ctx).getArchivedMarksheet({
      studentId: schools[0].studentId,
      sessionId: schools[0].academicId,
      examTypeId: schools[0].termId,
      actor: { userId: schools[0].userId, isStaff: true }
    });
    expect(staffView.version).toBe(2);
    expect(staffView.etag).not.toBeNull();

    const parentView = await createService(RetrievalService, ctx).getArchivedMarksheet({
      studentId: schools[0].studentId,
      sessionId: schools[0].academicId,
      examTypeId: schools[0].termId,
      actor: { userId: PARENT_USER_ID, isStaff: false }
    });
    expect(parentView.version).toBe(1);
    expect(parentView.document.student.id).toBe(schools[0].studentId);
    const token = parentView.document.student.token;
    expect(token.length).toBeGreaterThan(10);

    const resolved = await createService(PublicDocumentService, baseContext()).resolve(token);
    expect(resolved.version).toBe(1);
    expect(resolved.document.student.id).toBe(schools[0].studentId);

    const [storedToken] = await db.select().from(publicDocumentTokens).limit(1);
    expect(storedToken).toBeDefined();
    await createService(PublicDocumentService, ctx).revoke(
      storedToken?.id ?? 0,
      schools[0].userId
    );
    await expect(
      createService(PublicDocumentService, baseContext()).resolve(token)
    ).rejects.toBeInstanceOf(NotFoundError);

    const history = await createService(RetrievalService, ctx).getCrossSessionTranscript({
      studentId: schools[0].studentId,
      actor: { userId: schools[0].userId, isStaff: true }
    });
    expect(history.sessions).toHaveLength(1);
    expect(history.sessions[0]?.archive).not.toBeNull();
  });

  it("supersedes with a new version and leaves the old object untouched", async () => {
    const ctx = scopedContext(schools[0]);
    const retrieval = createService(RetrievalService, ctx);
    const before = await retrieval.listVersions({
      studentId: schools[0].studentId,
      sessionId: schools[0].academicId,
      examTypeId: schools[0].termId,
      actor: { userId: schools[0].userId, isStaff: true }
    });
    const first = before.find((entry) => entry.version === 1);
    expect(first).toBeDefined();

    const superseded = await createService(ReportCardService, ctx).supersede({
      studentId: schools[0].studentId,
      sessionId: schools[0].academicId,
      examTypeId: schools[0].termId,
      reason: "Corrected spelling of the subject",
      actorId: schools[0].userId
    });
    expect(superseded.version).toBeGreaterThan(1);

    const after = await retrieval.listVersions({
      studentId: schools[0].studentId,
      sessionId: schools[0].academicId,
      examTypeId: schools[0].termId,
      actor: { userId: schools[0].userId, isStaff: true }
    });
    const oldVersion = after.find((entry) => entry.version === 1);
    expect(oldVersion?.checksum).toBe(first?.checksum);
    expect(oldVersion?.status).toBe("superseded");
    expect(after.find((entry) => entry.version === superseded.version)?.status).toBe(
      "published"
    );
  });

  it("requires a closed term for overrides and audits the change", async () => {
    const ctx = scopedContext(schools[0]);
    const cards = createService(ReportCardService, ctx);
    await expect(
      cards.overrideResult({
        resultId: resultId(schools[0]),
        reason: "Open term",
        totalMarks: 40,
        actorId: schools[0].userId
      })
    ).rejects.toBeInstanceOf(ConflictError);

    await db
      .update(smExamTypes)
      .set({ status: "closed" })
      .where(eq(smExamTypes.id, schools[0].termId));

    const view = await cards.overrideResult({
      resultId: resultId(schools[0]),
      reason: "Arithmetic correction",
      totalMarks: 40,
      actorId: schools[0].userId
    });
    expect(view.resultId).toBe(resultId(schools[0]));
    expect(view.status).toBe("published");
    await expect(findResultById(repo, resultId(schools[0]))).resolves.toMatchObject({
      totalMarks: 40
    });
    const audit = await db
      .select()
      .from(gradeChangeAudit)
      .where(eq(gradeChangeAudit.resultId, resultId(schools[0])));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.reason).toBe("Arithmetic correction");
    expect(audit[0]?.beforeJson).toContain("30");
    expect(audit[0]?.afterJson).toContain("40");
  });

  it("rejects live writes once the session is restored", async () => {
    await db
      .update(smExamTypes)
      .set({ status: "closed" })
      .where(eq(smExamTypes.id, schools[0].termId));
    const ctx = scopedContext(schools[0]);
    await db
      .update(smAcademicYears)
      .set({ status: "archived_readable" })
      .where(eq(smAcademicYears.id, schools[0].academicId));

    await expect(
      createService(AttendanceService, ctx).upsertAttendance({
        studentId: schools[0].studentId,
        examTypeId: schools[0].termId,
        attendance: { daysOpened: 60, daysAbsent: 1, daysPresent: 59 }
      })
    ).rejects.toBeInstanceOf(SessionReadOnlyError);
    await expect(
      selectAcademicYearById(repo, schools[0].academicId)
    ).resolves.toMatchObject({ status: "archived_readable" });
  });
});
