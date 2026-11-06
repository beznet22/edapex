import type { ServiceContext } from "../context";
import { requireScopedContext, withTenantContext } from "../context";
import { ArchiveIncompleteError, ConflictError, NotFoundError } from "../errors";
import { decodeArchiveDocument, sha256BytesHex } from "./archive-object";
import { listAllStudentIds, listLatestObjects } from "./archive-job";
import type { SessionJobView } from "./job-progress";
import {
  encodeProgress,
  initialProgress,
  parseJobPayload,
  parseProgress,
  toSessionJobView
} from "./job-progress";
import type { ArchiveJobProgress, RowCounts } from "./job-progress";

const SLICE_SIZE = 20;

export interface RestorePreflight {
  readonly students: number;
  readonly objects: number;
  readonly rows: RowCounts;
  readonly gaps: readonly string[];
}

/**
 * Verifies every object and checksum before any live table is touched. This is
 * the §6.2 rule: a restore with a missing object aborts up front.
 */
export async function restorePreflight(
  ctx: ServiceContext,
  sessionId: number
): Promise<RestorePreflight> {
  const studentIds = await listAllStudentIds(ctx, sessionId);
  const objects = await listLatestObjects(ctx, sessionId);
  const byStudent = new Map(objects.map((object) => [object.studentId, object]));
  const gaps: string[] = [];
  const rows: {
    marks: number;
    results: number;
    ratings: number;
    remarks: number;
    studentAttendance: number;
    classAttendance: number;
    summaries: number;
  } = {
    marks: 0,
    results: 0,
    ratings: 0,
    remarks: 0,
    studentAttendance: 0,
    classAttendance: 0,
    summaries: 0
  };

  for (const studentId of studentIds) {
    const object = byStudent.get(studentId);
    if (object === undefined || object.status === "quarantined") {
      gaps.push(`student ${studentId}: missing`);
      continue;
    }
    const bytes = await ctx.ports.archiveStore.get(object.objectKey);
    if (bytes === null) {
      gaps.push(`student ${studentId}: object missing`);
      continue;
    }
    const checksum = await sha256BytesHex(bytes);
    if (checksum !== object.checksum) {
      gaps.push(`student ${studentId}: checksum mismatch`);
      continue;
    }
    const decoded = await decodeArchiveDocument(bytes);
    if (decoded.kind !== "ok") {
      gaps.push(`student ${studentId}: ${decoded.kind}`);
      continue;
    }
    rows.marks += decoded.document.raw.marks.length;
    rows.results += decoded.document.raw.results.length;
    rows.ratings += decoded.document.raw.ratings.length;
    rows.remarks += decoded.document.raw.remarks.length;
    rows.studentAttendance += decoded.document.raw.studentAttendance.length;
    rows.classAttendance += decoded.document.raw.classAttendance.length;
    rows.summaries += decoded.document.raw.summaries.length;
  }

  return { students: studentIds.length, objects: objects.length, rows, gaps };
}

export async function runRestoreSlice(
  ctx: ServiceContext,
  jobId: string
): Promise<SessionJobView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const job = await ctx.repos.archive.findSessionJob(scoped, jobId);
  if (job === null) throw new NotFoundError("Session job", jobId);
  if (job.kind !== "restore") throw new ConflictError("This job is not a restore job");
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return toSessionJobView(job);
  }
  const payload = parseJobPayload(job.payloadJson);
  const sessionId = payload?.sessionIds[0];
  if (payload === null || sessionId === undefined) {
    throw new ConflictError("Restore job payload is missing its session");
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

  let progress = parseProgress(job.progressJson);
  if (progress === null || progress.totalStudents === 0) {
    const preflight = await restorePreflight(sessionCtx, sessionId);
    if (preflight.gaps.length > 0) {
      const finishedAt = ctx.ports.clock.now();
      await ctx.repos.archive.finishSessionJob(scoped, jobId, {
        status: "failed",
        error: preflight.gaps.join("; "),
        finishedAt
      });
      throw new ArchiveIncompleteError(
        "The archive is incomplete; restore aborted before touching live tables",
        preflight.gaps
      );
    }
    progress = initialProgress("restore", preflight.students);
  }

  if (job.status === "queued") {
    await ctx.repos.archive.updateSessionJobProgress(scoped, jobId, {
      status: "running",
      progressJson: encodeProgress(progress),
      updatedAt: ctx.ports.clock.now()
    });
    await sessionCtx.repos.school.setAcademicYearArchiveState(sctx, sessionId, {
      status: "restoring"
    });
  }

  let current: ArchiveJobProgress = progress;
  for (
    let index = 0;
    index < SLICE_SIZE && current.processedStudents < current.totalStudents;
    index += 1
  ) {
    const [student] = await sessionCtx.repos.queries.listArchiveStudents(sctx, {
      academicId: sessionId,
      ...(current.lastStudentId === 0 ? {} : { afterStudentId: current.lastStudentId }),
      limit: 1
    });
    if (student === undefined) {
      current = { ...current, processedStudents: current.totalStudents };
      break;
    }

    const object = await sessionCtx.repos.archive.findLatestArchiveObject(sctx, {
      academicId: sessionId,
      studentId: student.studentId,
      examTypeId: 0,
      statuses: ["archived", "published", "reviewed", "superseded"] as const
    });
    if (object === null) {
      throw new ArchiveIncompleteError(
        "An archive object disappeared during restore",
        [`student ${student.studentId}: missing`]
      );
    }
    const bytes = await sessionCtx.ports.archiveStore.get(object.objectKey);
    if (bytes === null) {
      throw new ArchiveIncompleteError("An archive object disappeared during restore", [
        `student ${student.studentId}: object missing`
      ]);
    }
    const checksum = await sha256BytesHex(bytes);
    if (checksum !== object.checksum) {
      throw new ArchiveIncompleteError("An archive object failed verification during restore", [
        `student ${student.studentId}: checksum mismatch`
      ]);
    }
    const decoded = await decodeArchiveDocument(bytes);
    if (decoded.kind !== "ok") {
      throw new ArchiveIncompleteError("An archive object could not be decoded", [
        `student ${student.studentId}: ${decoded.kind}`
      ]);
    }

    const document = decoded.document;
    await sessionCtx.repos.assessments.restoreAssessmentRawRows(sctx, {
      marks: [...document.raw.marks],
      results: [...document.raw.results],
      ratings: [...document.raw.ratings],
      remarks: [...document.raw.remarks]
    });
    await sessionCtx.repos.attendance.restoreStudentAttendance(sctx, [
      ...document.raw.studentAttendance
    ]);
    await sessionCtx.repos.attendance.restoreClassAttendance(sctx, [
      ...document.raw.classAttendance
    ]);
    await sessionCtx.repos.archive.replaceSessionSummariesForStudent(sctx, {
      academicId: sessionId,
      studentId: student.studentId,
      rows: document.raw.summaries.map(({ id: _id, ...row }) => row)
    });

    current = {
      ...current,
      processedStudents: current.processedStudents + 1,
      lastStudentId: student.studentId,
      restoredRows: {
        marks: (current.restoredRows.marks ?? 0) + document.raw.marks.length,
        results: (current.restoredRows.results ?? 0) + document.raw.results.length,
        ratings: (current.restoredRows.ratings ?? 0) + document.raw.ratings.length,
        remarks: (current.restoredRows.remarks ?? 0) + document.raw.remarks.length,
        studentAttendance:
          (current.restoredRows.studentAttendance ?? 0) + document.raw.studentAttendance.length,
        classAttendance:
          (current.restoredRows.classAttendance ?? 0) + document.raw.classAttendance.length,
        summaries: (current.restoredRows.summaries ?? 0) + document.raw.summaries.length
      }
    };
  }

  if (current.processedStudents < current.totalStudents) {
    await ctx.repos.archive.updateSessionJobProgress(scoped, jobId, {
      progressJson: encodeProgress(current),
      updatedAt: ctx.ports.clock.now()
    });
    return toSessionJobView({ ...job, status: "running", progressJson: encodeProgress(current) });
  }

  const finishedAt = ctx.ports.clock.now();
  await sessionCtx.repos.school.setAcademicYearArchiveState(sctx, sessionId, {
    status: "archived_readable"
  });
  const resultJson = JSON.stringify({ counts: current.restoredRows, gaps: 0 });
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
