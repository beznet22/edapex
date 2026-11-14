import type { ServiceContext } from "../context";
import { requireScopedContext, withTenantContext } from "../context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { assertStudentReadable } from "./access";
import { captureStudentSession } from "./archive-capture";
import {
  archiveObjectKey,
  encodeArchiveDocument,
  sha256BytesHex
} from "./archive-object";
import { assertSessionWritable } from "../tenant/session-writable";

export interface ReportCardView {
  readonly id: number;
  readonly studentId: number;
  readonly sessionId: number;
  readonly examTypeId: number;
  readonly version: number;
  readonly status: string;
  readonly publishedAt: number | null;
  readonly publishedBy: number | null;
  readonly reason: string | null;
  readonly checksum: string;
}

export interface ReviewInput {
  readonly studentId: number;
  readonly examTypeId: number;
  readonly sessionId?: number;
  readonly actorId: number;
}

export interface PublishInput {
  readonly studentId: number;
  readonly examTypeId: number;
  readonly sessionId?: number;
  readonly actorId: number;
}

export interface SupersedeInput {
  readonly studentId: number;
  readonly sessionId: number;
  readonly examTypeId: number;
  readonly reason: string;
  readonly actorId: number;
}

export interface OverrideInput {
  readonly resultId: number;
  readonly reason: string;
  readonly totalMarks?: number;
  readonly isAbsent?: boolean;
  readonly teacherRemarks?: string | null;
  readonly actorId: number;
}

export interface OverrideView {
  readonly resultId: number;
  readonly version: number;
  readonly status: string;
}

interface SnapshotRowLike {
  readonly id: number;
  readonly studentId: number;
  readonly academicId: number;
  readonly examTypeId: number;
  readonly version: number;
  readonly status: string;
  readonly publishedAt: number | null;
  readonly publishedBy: number | null;
  readonly reason: string | null;
  readonly checksum: string;
}

const toView = (row: SnapshotRowLike): ReportCardView => ({
  id: row.id,
  studentId: row.studentId,
  sessionId: row.academicId,
  examTypeId: row.examTypeId,
  version: row.version,
  status: row.status,
  publishedAt: row.publishedAt,
  publishedBy: row.publishedBy,
  reason: row.reason,
  checksum: row.checksum
});

export class ReportCardService {
  constructor(private readonly ctx: ServiceContext) {}

  private resolveSession(sessionId: number | undefined): number {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const resolved = sessionId ?? scoped.tenant.academicId;
    if (resolved === null) {
      throw new ValidationError("A session is required", "sessionId");
    }
    return resolved;
  }

  private sessionContext(sessionId: number): ServiceContext {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return withTenantContext(this.ctx, {
      ...scoped.tenant,
      academicId: sessionId,
      classId: null,
      sectionId: null
    });
  }

  async review(input: ReviewInput): Promise<ReportCardView> {
    const sessionId = this.resolveSession(input.sessionId);
    const sessionCtx = this.sessionContext(sessionId);
    await assertSessionWritable(sessionCtx);
    await assertStudentReadable(sessionCtx, input.studentId, {
      userId: input.actorId,
      isStaff: true
    });
    return this.snapshot(sessionCtx, {
      studentId: input.studentId,
      sessionId,
      examTypeId: input.examTypeId,
      actorId: input.actorId,
      status: "reviewed",
      reason: null
    });
  }

  async publish(input: PublishInput): Promise<ReportCardView> {
    const sessionId = this.resolveSession(input.sessionId);
    const sessionCtx = this.sessionContext(sessionId);
    await assertSessionWritable(sessionCtx);
    await assertStudentReadable(sessionCtx, input.studentId, {
      userId: input.actorId,
      isStaff: true
    });
    const sctx = requireScopedContext(sessionCtx.repos.ctx);
    const reviewed = await sessionCtx.repos.archive.findLatestArchiveObject(sctx, {
      academicId: sessionId,
      studentId: input.studentId,
      examTypeId: input.examTypeId,
      statuses: ["reviewed"]
    });
    if (reviewed === null) {
      throw new ConflictError("Review the marksheet before publishing it");
    }
    const now = this.ctx.ports.clock.now();
    const previous = await sessionCtx.repos.archive.findLatestArchiveObject(sctx, {
      academicId: sessionId,
      studentId: input.studentId,
      examTypeId: input.examTypeId,
      statuses: ["published"]
    });
    if (previous !== null) {
      await sessionCtx.repos.archive.updateArchiveObjectStatus(sctx, {
        id: previous.id,
        status: "superseded"
      });
    }
    await sessionCtx.repos.archive.updateArchiveObjectStatus(sctx, {
      id: reviewed.id,
      status: "published",
      publishedAt: now,
      publishedBy: input.actorId
    });
    const row = await sessionCtx.repos.archive.findArchiveObjectById(sctx, reviewed.id);
    if (row === null) throw new ConflictError("The published version disappeared");
    return toView(row);
  }

  async supersede(input: SupersedeInput): Promise<ReportCardView> {
    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new ValidationError("A reason is required to supersede a report card", "reason");
    }
    const sessionCtx = this.sessionContext(input.sessionId);
    await assertStudentReadable(sessionCtx, input.studentId, {
      userId: input.actorId,
      isStaff: true
    });
    const sctx = requireScopedContext(sessionCtx.repos.ctx);
    const previous = await sessionCtx.repos.archive.findLatestArchiveObject(sctx, {
      academicId: input.sessionId,
      studentId: input.studentId,
      examTypeId: input.examTypeId,
      statuses: ["published"]
    });
    if (previous === null) {
      throw new ConflictError("Only a published report card can be superseded");
    }
    const view = await this.snapshot(sessionCtx, {
      studentId: input.studentId,
      sessionId: input.sessionId,
      examTypeId: input.examTypeId,
      actorId: input.actorId,
      status: "published",
      reason
    });
    await sessionCtx.repos.archive.updateArchiveObjectStatus(sctx, {
      id: previous.id,
      status: "superseded"
    });
    return view;
  }

  async overrideResult(input: OverrideInput): Promise<OverrideView> {
    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new ValidationError("A reason is required to override a grade", "reason");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const result = await this.ctx.repos.assessments.findResultById(scoped, input.resultId);
    if (result === null) throw new NotFoundError("Result", input.resultId);
    if (
      result.academicId === null ||
      result.examTypeId === null ||
      result.studentId === null
    ) {
      throw new ConflictError("The result is not bound to a session, term and student");
    }

    const sessionCtx = this.sessionContext(result.academicId);
    const sctx = requireScopedContext(sessionCtx.repos.ctx);
    const terms = await sessionCtx.repos.assessments.listAllExamTypes(sctx);
    const term = terms.find((entry) => entry.id === result.examTypeId);
    if (term === undefined) throw new NotFoundError("Exam type", result.examTypeId);
    if (term.status !== "closed") {
      throw new ConflictError("Marks can only be overridden after the term is closed");
    }

    const totalMarks = input.totalMarks ?? result.totalMarks;
    const isAbsent =
      input.isAbsent === undefined ? result.isAbsent : input.isAbsent ? 1 : 0;
    const teacherRemarks =
      input.teacherRemarks === undefined ? result.teacherRemarks : input.teacherRemarks;
    const before = JSON.stringify({
      totalMarks: result.totalMarks,
      totalGpaGrade: result.totalGpaGrade,
      isAbsent: result.isAbsent,
      teacherRemarks: result.teacherRemarks
    });
    const after = JSON.stringify({
      totalMarks,
      totalGpaGrade: result.totalGpaGrade,
      isAbsent,
      teacherRemarks
    });

    await sessionCtx.repos.assessments.overrideResultAndMark(sctx, {
      resultId: result.id,
      studentId: result.studentId,
      academicId: result.academicId,
      examSetupId: result.examSetupId,
      totalMarks,
      totalGpaPoint: result.totalGpaPoint,
      totalGpaGrade: result.totalGpaGrade,
      isAbsent,
      teacherRemarks,
      updatedBy: input.actorId
    });
    const now = this.ctx.ports.clock.now();
    await sessionCtx.repos.archive.insertGradeAudit(sctx, {
      schoolId: sctx.tenant.schoolId,
      resultId: result.id,
      studentId: result.studentId,
      academicId: result.academicId,
      examTypeId: result.examTypeId,
      subjectId: result.subjectId,
      actorId: input.actorId,
      beforeJson: before,
      afterJson: after,
      reason,
      createdAt: now
    });

    const previous = await sessionCtx.repos.archive.findLatestArchiveObject(sctx, {
      academicId: result.academicId,
      studentId: result.studentId,
      examTypeId: result.examTypeId,
      statuses: ["published"]
    });
    const view = await this.snapshot(sessionCtx, {
      studentId: result.studentId,
      sessionId: result.academicId,
      examTypeId: result.examTypeId,
      actorId: input.actorId,
      status: "published",
      reason
    });
    if (previous !== null) {
      await sessionCtx.repos.archive.updateArchiveObjectStatus(sctx, {
        id: previous.id,
        status: "superseded"
      });
    }
    return { resultId: result.id, version: view.version, status: view.status };
  }

  private async snapshot(
    ctx: ServiceContext,
    input: {
      readonly studentId: number;
      readonly sessionId: number;
      readonly examTypeId: number;
      readonly actorId: number;
      readonly status: "reviewed" | "published";
      readonly reason: string | null;
    }
  ): Promise<ReportCardView> {
    const sctx = requireScopedContext(ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const document = await captureStudentSession(ctx, {
      studentId: input.studentId,
      academicId: input.sessionId,
      archivedAt: now
    });
    if (document === null) {
      throw new ConflictError("There are no marks to snapshot for this term");
    }
    const version = await ctx.repos.archive.nextArchiveVersion(sctx, {
      academicId: input.sessionId,
      studentId: input.studentId
    });
    const bytes = encodeArchiveDocument(document);
    const checksum = await sha256BytesHex(bytes);
    const objectKey = archiveObjectKey({
      schoolId: sctx.tenant.schoolId,
      sessionId: input.sessionId,
      studentId: input.studentId,
      version
    });
    await ctx.ports.archiveStore.put(objectKey, bytes);
    await ctx.repos.archive.insertArchiveObject(sctx, {
      schoolId: sctx.tenant.schoolId,
      academicId: input.sessionId,
      studentId: input.studentId,
      studentRecordId: document.meta.studentRecordId,
      examTypeId: input.examTypeId,
      objectKey,
      checksum,
      bytes: bytes.length,
      schemaVersion: 1,
      version,
      status: input.status,
      publishedAt: input.status === "published" ? now : null,
      publishedBy: input.actorId,
      reason: input.reason,
      createdAt: now
    });
    const row = await ctx.repos.archive.findArchiveObjectByKey(sctx, objectKey);
    if (row === null) throw new ConflictError("The snapshot was not indexed");
    return toView(row);
  }
}
