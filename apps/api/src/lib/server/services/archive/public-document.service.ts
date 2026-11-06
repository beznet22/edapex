import type { Marksheet } from "../../../schema/marksheet";
import type { ServiceContext } from "../context";
import { requireScopedContext, withTenantContext } from "../context";
import { ArchiveIncompleteError, ArchiveVersionError, NotFoundError } from "../errors";
import { readArchiveDocument } from "./archive-object";
import { verifyPublicToken } from "./public-token";

export interface PublicDocumentView {
  readonly templateVersion: "marksheet@1";
  readonly version: number;
  readonly publishedAt: number | null;
  readonly filename: string;
  readonly document: Marksheet;
}

export class PublicDocumentService {
  constructor(private readonly ctx: ServiceContext) {}

  async resolve(token: string): Promise<PublicDocumentView> {
    const now = this.ctx.ports.clock.now();
    const verified = await verifyPublicToken(this.ctx, token, now);
    if (verified === null) throw new NotFoundError("Document", "token");
    const scoped = withTenantContext(this.ctx, {
      schoolId: verified.schoolId,
      userId: verified.tokenId,
      staffId: null,
      designationId: null,
      roleId: null,
      academicId: verified.sessionId,
      classId: null,
      sectionId: null
    });
    const sctx = requireScopedContext(scoped.repos.ctx);
    const rows = await scoped.repos.archive.listArchiveObjectsForStudent(sctx, {
      academicId: verified.sessionId,
      studentId: verified.studentId
    });
    const row = rows.find(
      (entry) =>
        entry.version === verified.version &&
        entry.examTypeId === verified.examTypeId &&
        (entry.status === "published" || entry.status === "superseded")
    );
    if (row === undefined) throw new NotFoundError("Document", "token");

    const loaded = await readArchiveDocument(scoped.ports.archiveStore, row);
    if (loaded.kind === "missing" || loaded.kind === "checksum") {
      throw new ArchiveIncompleteError("The archived document failed verification");
    }
    if (loaded.kind === "unsupported") throw new ArchiveVersionError(loaded.schemaVersion);
    if (loaded.kind === "invalid") {
      throw new ArchiveIncompleteError("The archived document could not be decoded");
    }
    const document = loaded.document.marksheets[String(verified.examTypeId)];
    if (document === undefined) throw new NotFoundError("Document", "token");
    return {
      templateVersion: "marksheet@1",
      version: row.version,
      publishedAt: row.publishedAt,
      filename: `marksheet-${verified.studentId}-${verified.examTypeId}-v${row.version}.pdf`,
      document: {
        ...document,
        student: { ...document.student, token }
      }
    };
  }

  async revoke(tokenId: number, actorId: number): Promise<void> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    await this.ctx.repos.archive.revokePublicToken(scoped, {
      id: tokenId,
      revokedBy: actorId,
      revokedAt: this.ctx.ports.clock.now()
    });
  }
}
