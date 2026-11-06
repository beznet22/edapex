import type { ServiceContext } from "../context";
import { requireScopedContext, withTenantContext } from "../context";
import { ConflictError, NotFoundError } from "../errors";
import type { SessionJobView } from "./job-progress";
import {
  encodeProgress,
  initialProgress,
  parseJobPayload,
  parseProgress,
  toSessionJobView
} from "./job-progress";
import type { ArchiveJobProgress, RowCounts } from "./job-progress";
import { captureStudentSession } from "./archive-capture";
import {
  archiveManifestKey,
  archiveObjectKey,
  encodeArchiveDocument,
  sha256BytesHex
} from "./archive-object";
import { buildArchiveManifest, encodeManifest, type ManifestObjectInput } from "./manifest";
import type { ArchiveManifest } from "../../../schema/archive";

const SLICE_SIZE = 20;
const PAGE_SIZE = 500;

export async function runArchiveSlice(
  ctx: ServiceContext,
  jobId: string
): Promise<SessionJobView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const job = await ctx.repos.archive.findSessionJob(scoped, jobId);
  if (job === null) throw new NotFoundError("Session job", jobId);
  if (job.kind !== "archive") {
    throw new ConflictError("This job is not an archive job");
  }
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return toSessionJobView(job);
  }
  const payload = parseJobPayload(job.payloadJson);
  const sessionId = payload?.sessionIds[0];
  if (payload === null || sessionId === undefined) {
    throw new ConflictError("Archive job payload is missing its session");
  }

  const sessionCtx = withTenantContext(ctx, {
    ...scoped.tenant,
    academicId: sessionId,
    classId: null,
    sectionId: null
  });
  const sctx = requireScopedContext(sessionCtx.repos.ctx);
  const year = await sessionCtx.repos.school.selectAcademicYearById(sctx, sessionId);
  if (year === null) throw new NotFoundError("Academic year", sessionId);
  if (year.status === "restoring" || year.status === "archived_readable") {
    throw new ConflictError("A restoring or restored session cannot be archived again");
  }

  const now = ctx.ports.clock.now();
  const progress =
    parseProgress(job.progressJson) ??
    initialProgress("archive", await sessionCtx.repos.queries.countArchiveStudents(sctx, sessionId));
  if (job.status === "queued") {
    await ctx.repos.archive.updateSessionJobProgress(scoped, jobId, {
      status: "running",
      progressJson: encodeProgress(progress),
      updatedAt: now
    });
    if (year.status === "active") {
      await sessionCtx.repos.school.setAcademicYearArchiveState(sctx, sessionId, {
        status: "closing"
      });
    }
  }

  let current: ArchiveJobProgress = progress;
  for (let index = 0; index < SLICE_SIZE && current.processedStudents < current.totalStudents; index += 1) {
    const [student] = await sessionCtx.repos.queries.listArchiveStudents(sctx, {
      academicId: sessionId,
      afterStudentId: current.lastStudentId,
      limit: 1
    });
    if (student === undefined) {
      current = { ...current, processedStudents: current.totalStudents };
      break;
    }

    const existing = await sessionCtx.repos.archive.findLatestArchiveObject(sctx, {
      academicId: sessionId,
      studentId: student.studentId,
      examTypeId: 0,
      statuses: ["archived", "published", "reviewed", "superseded"] as const
    });
    if (existing !== null) {
      current = {
        ...current,
        processedStudents: current.processedStudents + 1,
        lastStudentId: student.studentId
      };
      continue;
    }

    const document = await captureStudentSession(sessionCtx, {
      studentId: student.studentId,
      academicId: sessionId,
      archivedAt: now
    });
    if (document === null) {
      current = {
        ...current,
        processedStudents: current.processedStudents + 1,
        lastStudentId: student.studentId
      };
      continue;
    }

    const bytes = encodeArchiveDocument(document);
    const checksum = await sha256BytesHex(bytes);
    const version = await sessionCtx.repos.archive.nextArchiveVersion(sctx, {
      academicId: sessionId,
      studentId: student.studentId
    });
    const objectKey = archiveObjectKey({
      schoolId: sctx.tenant.schoolId,
      sessionId,
      studentId: student.studentId,
      version
    });
    await sessionCtx.ports.archiveStore.put(objectKey, bytes);
    const readBack = await sessionCtx.ports.archiveStore.get(objectKey);
    const readChecksum = readBack === null ? null : await sha256BytesHex(readBack);
    const verified = readChecksum === checksum;

    await sessionCtx.repos.archive.insertArchiveObject(sctx, {
      schoolId: sctx.tenant.schoolId,
      academicId: sessionId,
      studentId: student.studentId,
      studentRecordId: document.meta.studentRecordId,
      examTypeId: 0,
      objectKey,
      checksum,
      bytes: bytes.length,
      schemaVersion: 1,
      version,
      status: verified ? "archived" : "quarantined",
      error: verified ? null : "Checksum mismatch on read-back",
      createdAt: now
    });

    if (verified) {
      await sessionCtx.repos.archive.replaceSessionSummariesForStudent(sctx, {
        academicId: sessionId,
        studentId: student.studentId,
        rows: document.raw.summaries.map(({ id: _id, ...row }) => row)
      });
    }

    current = {
      ...current,
      processedStudents: current.processedStudents + 1,
      lastStudentId: student.studentId,
      objectsWritten: current.objectsWritten + (verified ? 1 : 0),
      quarantined: current.quarantined + (verified ? 0 : 1)
    };
  }

  if (current.processedStudents < current.totalStudents) {
    await ctx.repos.archive.updateSessionJobProgress(scoped, jobId, {
      progressJson: encodeProgress(current),
      updatedAt: ctx.ports.clock.now()
    });
    return toSessionJobView({
      ...job,
      status: "running",
      progressJson: encodeProgress(current)
    });
  }

  const manifest = await buildSessionManifest(sessionCtx, sessionId, now);
  const manifestKey = archiveManifestKey(sctx.tenant.schoolId, sessionId);
  await sessionCtx.ports.archiveStore.put(manifestKey, encodeManifest(manifest));
  await sessionCtx.repos.school.setAcademicYearArchiveState(sctx, sessionId, {
    status: "archived",
    archivedAt: now,
    archiveManifestKey: manifestKey
  });

  let deleted: RowCounts = {};
  if (payload.purge) {
    deleted = await purgeSessionRows(sessionCtx, sessionId);
  }

  const finishedAt = ctx.ports.clock.now();
  const resultJson = JSON.stringify({
    counts: { objects: current.objectsWritten, ...deleted },
    gaps: manifest.gaps.length
  });
  await ctx.repos.archive.finishSessionJob(scoped, jobId, {
    status: "completed",
    progressJson: encodeProgress(current),
    resultJson,
    finishedAt
  });
  return toSessionJobView({
    ...job,
    status: "completed",
    progressJson: encodeProgress(current),
    resultJson,
    updatedAt: finishedAt,
    finishedAt
  });
}

export async function purgeSessionRows(
  ctx: ServiceContext,
  sessionId: number
): Promise<RowCounts> {
  const sctx = requireScopedContext(ctx.repos.ctx);
  const assessment = await ctx.repos.assessments.purgeAssessmentRawRows(sctx, sessionId);
  const studentAttendance = await ctx.repos.attendance.purgeStudentAttendanceForSession(
    sctx,
    sessionId
  );
  const classAttendance = await ctx.repos.attendance.purgeClassAttendanceForSession(
    sctx,
    sessionId
  );
  return {
    marks: assessment.marks,
    results: assessment.results,
    ratings: assessment.ratings,
    remarks: assessment.remarks,
    studentAttendance,
    classAttendance
  };
}

export async function buildSessionManifest(
  ctx: ServiceContext,
  sessionId: number,
  generatedAt: number
): Promise<ArchiveManifest> {
  const sctx = requireScopedContext(ctx.repos.ctx);
  const expectedStudentIds = await listAllStudentIds(ctx, sessionId);
  const objects = await listLatestObjects(ctx, sessionId);
  const terms = await ctx.repos.queries.listSessionTerms(sctx, sessionId);
  return buildArchiveManifest({
    schoolId: sctx.tenant.schoolId,
    sessionId,
    generatedAt,
    expectedStudentIds,
    objects,
    terms: terms.map((term) => term.id)
  });
}

export interface SessionObjectStats {
  readonly total: number;
  readonly quarantined: number;
  readonly bytes: number;
}

export async function sessionObjectStats(
  ctx: ServiceContext,
  sessionId: number
): Promise<SessionObjectStats> {
  const objects = await listLatestObjects(ctx, sessionId);
  return {
    total: objects.length,
    quarantined: objects.filter((object) => object.status === "quarantined").length,
    bytes: objects.reduce((sum, object) => sum + object.bytes, 0)
  };
}

async function listAllStudentIds(ctx: ServiceContext, sessionId: number): Promise<number[]> {
  const sctx = requireScopedContext(ctx.repos.ctx);
  const ids: number[] = [];
  let afterStudentId: number | undefined;
  for (;;) {
    const page = await ctx.repos.queries.listArchiveStudents(sctx, {
      academicId: sessionId,
      ...(afterStudentId === undefined ? {} : { afterStudentId }),
      limit: PAGE_SIZE
    });
    if (page.length === 0) break;
    ids.push(...page.map((student) => student.studentId));
    afterStudentId = page[page.length - 1]?.studentId;
    if (page.length < PAGE_SIZE) break;
  }
  return ids;
}

async function listLatestObjects(
  ctx: ServiceContext,
  sessionId: number
): Promise<ManifestObjectInput[]> {
  const sctx = requireScopedContext(ctx.repos.ctx);
  const byStudent = new Map<number, ManifestObjectInput>();
  let afterStudentId: number | undefined;
  for (;;) {
    const page = await ctx.repos.archive.listArchiveObjectsForSession(sctx, {
      academicId: sessionId,
      ...(afterStudentId === undefined ? {} : { afterStudentId }),
      limit: PAGE_SIZE
    });
    if (page.length === 0) break;
    for (const object of page) {
      const existing = byStudent.get(object.studentId);
      if (existing === undefined || object.version > existing.version) {
        byStudent.set(object.studentId, {
          studentId: object.studentId,
          objectKey: object.objectKey,
          checksum: object.checksum,
          bytes: object.bytes,
          version: object.version,
          status: object.status
        });
      }
    }
    afterStudentId = page[page.length - 1]?.studentId;
    if (page.length < PAGE_SIZE) break;
  }
  return [...byStudent.values()];
}
