import type { Marksheet } from "../../../schema/marksheet";
import type { Transcript } from "../../../schema/transcript";
import type { ServiceContext } from "../context";
import { requireScopedContext, withTenantContext } from "../context";
import {
  NotFoundError,
  PermissionError,
  ValidationError
} from "../errors";
import { buildMarksheet } from "../assessment/marksheet-query";
import { buildTranscript } from "../assessment/transcript-builder";
import { assertStudentReadable, type RetrievalActor } from "./access";
import { loadArchiveDocument } from "./archive-read";
import { issuePublicToken } from "./public-token";

export interface MarksheetView {
  readonly document: Marksheet;
  readonly etag: string | null;
  readonly version: number;
  readonly publishedAt: number | null;
}

export interface TranscriptView {
  readonly document: Transcript;
  readonly etag: string | null;
  readonly version: number;
  readonly publishedAt: number | null;
}

export interface ArchiveVersionView {
  readonly id: number;
  readonly version: number;
  readonly status: string;
  readonly publishedAt: number | null;
  readonly publishedBy: number | null;
  readonly reason: string | null;
  readonly checksum: string;
  readonly bytes: number;
  readonly objectKey: string;
  readonly schemaVersion: number;
}

export interface SessionHistoryTerm {
  readonly termId: number;
  readonly sequence: number;
  readonly total: number | null;
  readonly average: number | null;
  readonly grade: string | null;
  readonly gpa: number | null;
  readonly position: number | null;
  readonly subjectCount: number | null;
}

export interface SessionHistory {
  readonly sessionId: number;
  readonly label: string;
  readonly terms: readonly SessionHistoryTerm[];
  readonly archive: {
    readonly objectKey: string;
    readonly checksum: string;
    readonly version: number;
    readonly status: string;
  } | null;
}

export interface CrossSessionHistory {
  readonly studentId: number;
  readonly sessions: readonly SessionHistory[];
}

export interface MarksheetInput {
  readonly studentId: number;
  readonly examTypeId: number;
  readonly sessionId?: number;
  readonly actor: RetrievalActor;
}

export interface ArchivedMarksheetInput {
  readonly studentId: number;
  readonly sessionId: number;
  readonly examTypeId: number;
  readonly actor: RetrievalActor;
}

export interface TranscriptInput {
  readonly studentId: number;
  readonly sessionId: number;
  readonly actor: RetrievalActor;
}

export interface CrossSessionInput {
  readonly studentId: number;
  readonly actor: RetrievalActor;
}

export interface VersionsInput {
  readonly studentId: number;
  readonly sessionId: number;
  readonly examTypeId: number;
  readonly actor: RetrievalActor;
}

interface SummaryRowLike {
  readonly academicId: number;
  readonly termId: number;
  readonly sequence: number;
  readonly total: number | null;
  readonly average: number | null;
  readonly grade: string | null;
  readonly gpa: number | null;
  readonly position: number | null;
  readonly subjectCount: number | null;
}

export class RetrievalService {
  constructor(private readonly ctx: ServiceContext) {}

  private sessionContext(sessionId: number): ServiceContext {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return withTenantContext(this.ctx, {
      ...scoped.tenant,
      academicId: sessionId,
      classId: null,
      sectionId: null
    });
  }

  async getMarksheet(input: MarksheetInput): Promise<MarksheetView> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const sessionId = input.sessionId ?? scoped.tenant.academicId;
    if (sessionId === null) {
      throw new ValidationError("A session is required to read a marksheet", "sessionId");
    }
    const sessionCtx = this.sessionContext(sessionId);
    await assertStudentReadable(sessionCtx, input.studentId, input.actor);
    const row = await this.selectRow(
      sessionCtx,
      sessionId,
      input.studentId,
      input.examTypeId,
      input.actor
    );
    if (row !== null) {
      return this.marksheetFromRow(sessionCtx, row, input);
    }
    if (!input.actor.isStaff) {
      throw new PermissionError("Only published documents are visible to parents");
    }
    const live = await buildMarksheet(sessionCtx, {
      studentId: input.studentId,
      examId: input.examTypeId
    });
    if (live === null) throw new NotFoundError("Marksheet", `${input.studentId}/${input.examTypeId}`);
    return { document: live, etag: null, version: 0, publishedAt: null };
  }

  async getArchivedMarksheet(input: ArchivedMarksheetInput): Promise<MarksheetView> {
    const sessionCtx = this.sessionContext(input.sessionId);
    await assertStudentReadable(sessionCtx, input.studentId, input.actor);
    const row = await this.selectRow(
      sessionCtx,
      input.sessionId,
      input.studentId,
      input.examTypeId,
      input.actor
    );
    if (row === null) {
      throw new NotFoundError(
        "Archived marksheet",
        `${input.studentId}/${input.sessionId}/${input.examTypeId}`
      );
    }
    return this.marksheetFromRow(sessionCtx, row, {
      studentId: input.studentId,
      examTypeId: input.examTypeId,
      sessionId: input.sessionId,
      actor: input.actor
    });
  }

  async getTranscript(input: TranscriptInput): Promise<TranscriptView> {
    const sessionCtx = this.sessionContext(input.sessionId);
    await assertStudentReadable(sessionCtx, input.studentId, input.actor);
    const sctx = requireScopedContext(sessionCtx.repos.ctx);
    const statuses = input.actor.isStaff
      ? (["archived", "reviewed", "published", "superseded"] as const)
      : (["published"] as const);
    let row = await sessionCtx.repos.archive.findLatestArchiveObject(sctx, {
      academicId: input.sessionId,
      studentId: input.studentId,
      examTypeId: 0,
      statuses
    });
    if (row === null && !input.actor.isStaff) {
      const all = await sessionCtx.repos.archive.listArchiveObjectsForStudent(sctx, {
        academicId: input.sessionId,
        studentId: input.studentId
      });
      row = all.find((entry) => entry.status === "published") ?? null;
    }
    if (row !== null) {
      const document = await loadArchiveDocument(sessionCtx, row);
      const token =
        row.status === "published"
          ? (
              await issuePublicToken(
                sessionCtx,
                {
                  studentId: input.studentId,
                  sessionId: input.sessionId,
                  examTypeId: row.examTypeId,
                  version: row.version
                },
                input.actor.userId
              )
            ).token
          : "";
      const withToken =
        token.length === 0
          ? document.transcript
          : { ...document.transcript, student: { ...document.transcript.student, token } };
      return {
        document: withToken,
        etag: row.checksum,
        version: row.version,
        publishedAt: row.publishedAt
      };
    }
    if (!input.actor.isStaff) {
      throw new PermissionError("Only published documents are visible to parents");
    }
    const live = await buildTranscript(sessionCtx, {
      studentId: input.studentId,
      academicId: input.sessionId
    });
    if (live === null) throw new NotFoundError("Transcript", `${input.studentId}/${input.sessionId}`);
    return { document: live, etag: null, version: 0, publishedAt: null };
  }

  async getCrossSessionTranscript(input: CrossSessionInput): Promise<CrossSessionHistory> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const summaries: readonly SummaryRowLike[] =
      await this.ctx.repos.archive.listSessionSummariesForStudentAllSessions(
        scoped,
        input.studentId
      );
    const firstSession = summaries[0]?.academicId;
    const accessCtx = firstSession === undefined ? this.ctx : this.sessionContext(firstSession);
    await assertStudentReadable(accessCtx, input.studentId, input.actor);

    const bySession = new Map<number, SummaryRowLike[]>();
    for (const row of summaries) {
      const rows = bySession.get(row.academicId) ?? [];
      rows.push(row);
      bySession.set(row.academicId, rows);
    }

    const sessions: SessionHistory[] = [];
    for (const [sessionId, rows] of bySession) {
      const year = await this.ctx.repos.school.selectAcademicYearById(scoped, sessionId);
      const objects = await this.ctx.repos.archive.listArchiveObjectsForStudent(scoped, {
        academicId: sessionId,
        studentId: input.studentId
      });
      const link =
        objects.find(
          (entry) => entry.status === "published" || entry.status === "archived"
        ) ?? null;
      if (!input.actor.isStaff && (link === null || link.status !== "published")) continue;
      sessions.push({
        sessionId,
        label: year?.year ?? "",
        terms: rows.map((row) => ({
          termId: row.termId,
          sequence: row.sequence,
          total: row.total,
          average: row.average,
          grade: row.grade,
          gpa: row.gpa,
          position: row.position,
          subjectCount: row.subjectCount
        })),
        archive:
          link === null
            ? null
            : {
                objectKey: link.objectKey,
                checksum: link.checksum,
                version: link.version,
                status: link.status
              }
      });
    }
    return { studentId: input.studentId, sessions };
  }

  async listVersions(input: VersionsInput): Promise<readonly ArchiveVersionView[]> {
    if (!input.actor.isStaff) {
      throw new PermissionError("Only staff can list document versions");
    }
    const sessionCtx = this.sessionContext(input.sessionId);
    await assertStudentReadable(sessionCtx, input.studentId, input.actor);
    const sctx = requireScopedContext(sessionCtx.repos.ctx);
    const rows = await sessionCtx.repos.archive.listArchiveObjectVersions(sctx, {
      academicId: input.sessionId,
      studentId: input.studentId,
      examTypeId: input.examTypeId,
      statuses: ["reviewed", "published", "superseded"] as const
    });
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      publishedAt: row.publishedAt,
      publishedBy: row.publishedBy,
      reason: row.reason,
      checksum: row.checksum,
      bytes: row.bytes,
      objectKey: row.objectKey,
      schemaVersion: row.schemaVersion
    }));
  }

  private async marksheetFromRow(
    ctx: ServiceContext,
    row: { readonly objectKey: string; readonly checksum: string; readonly version: number; readonly publishedAt: number | null; readonly status: string; readonly examTypeId: number },
    input: MarksheetInput
  ): Promise<MarksheetView> {
    const document = await loadArchiveDocument(ctx, row);
    const marksheet = document.marksheets[String(input.examTypeId)];
    if (marksheet === undefined) {
      throw new NotFoundError("Marksheet", `${input.studentId}/${input.examTypeId}`);
    }
    const token =
      row.status === "published"
        ? (
            await issuePublicToken(
              ctx,
              {
                studentId: input.studentId,
                sessionId: document.meta.sessionId,
                examTypeId: input.examTypeId,
                version: row.version
              },
              input.actor.userId
            )
          ).token
        : "";
    const withToken =
      token.length === 0 ? marksheet : { ...marksheet, student: { ...marksheet.student, token } };
    return {
      document: withToken,
      etag: row.checksum,
      version: row.version,
      publishedAt: row.publishedAt
    };
  }

  private async selectRow(
    ctx: ServiceContext,
    sessionId: number,
    studentId: number,
    examTypeId: number,
    actor: RetrievalActor
  ) {
    const sctx = requireScopedContext(ctx.repos.ctx);
    const statuses = actor.isStaff
      ? (["reviewed", "published", "superseded", "archived"] as const)
      : (["published"] as const);
    const termRow = await ctx.repos.archive.findLatestArchiveObject(sctx, {
      academicId: sessionId,
      studentId,
      examTypeId,
      statuses
    });
    if (!actor.isStaff) return termRow;
    const snapshot = await ctx.repos.archive.findLatestArchiveObject(sctx, {
      academicId: sessionId,
      studentId,
      examTypeId: 0,
      statuses: ["archived", "published"] as const
    });
    if (snapshot === null) return termRow;
    if (termRow === null || snapshot.version > termRow.version) return snapshot;
    return termRow;
  }
}
